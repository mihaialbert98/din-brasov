import { db } from "@/lib/db";
import { restaurants, reservationHours, reservations, reservationTables, reservationTableGroups, reservationTableGroupMembers, restaurantClientNotes, adminAuditLog, places, users } from "@/lib/db/schema";
import { eq, and, gte, ne, asc, inArray, isNull, isNotNull, sql, type AnyColumn } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { sendReservationConfirmedEmail, sendReservationDeclinedEmail, sendReservationCancelledEmail, sendReservationUpdatedEmail } from "@/lib/email";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import type { Session } from "next-auth";

export type Area = "inside" | "outside";

export type ReservationHour = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  seatsPerSlot: number;
  seatsInside: number | null;
  seatsOutside: number | null;
};

/** Whether a restaurant splits reservations into interior/terasă areas. */
export async function areasEnabled(restaurantId: string): Promise<boolean> {
  const [r] = await db
    .select({ on: restaurants.reservationAreasEnabled })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return !!r?.on;
}

/**
 * Whether a restaurant can currently take public reservations: doubly gated
 * (admin grant + owner enable) AND has at least one bookable-hours window.
 */
export async function canReserve(restaurantId: string): Promise<boolean> {
  const [r] = await db
    .select({
      admin: restaurants.reservationsEnabledByAdmin,
      owner: restaurants.reservationsEnabledByOwner,
      status: restaurants.status,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!r || r.status !== "active" || !r.admin || !r.owner) return false;

  const [hour] = await db
    .select({ id: reservationHours.id })
    .from(reservationHours)
    .where(eq(reservationHours.restaurantId, restaurantId))
    .limit(1);
  return !!hour;
}

/** All bookable-hours rows for a restaurant (used by the form + server validation). */
export async function getReservationHours(restaurantId: string): Promise<ReservationHour[]> {
  return db
    .select({
      id: reservationHours.id,
      dayOfWeek: reservationHours.dayOfWeek,
      startTime: reservationHours.startTime,
      endTime: reservationHours.endTime,
      slotMinutes: reservationHours.slotMinutes,
      seatsPerSlot: reservationHours.seatsPerSlot,
      seatsInside: reservationHours.seatsInside,
      seatsOutside: reservationHours.seatsOutside,
    })
    .from(reservationHours)
    .where(eq(reservationHours.restaurantId, restaurantId));
}

/**
 * When a PLATFORM ADMIN (not the owner) changes a restaurant's reservation config,
 * write an audit-log row. No email is sent — changes are frequent and per-change
 * emails were noise; the append-only audit log is the record of accountability.
 * No-op for owners.
 */
export async function auditAdminReservationChange(
  session: Session | null,
  role: string | undefined,
  restaurantId: string,
  change: string
): Promise<void> {
  if (!isPlatformStaff(role) || !session?.user?.id) return;

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "edit_reservation_settings",
    entityType: "restaurant",
    entityId: restaurantId,
    metadataJson: JSON.stringify({ change }),
  });
}

/** The single-party cap for a restaurant (independent of per-slot seat capacity). */
export async function getMaxPartySize(restaurantId: string): Promise<number> {
  const [r] = await db
    .select({ cap: restaurants.reservationMaxPartySize })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return r?.cap ?? 12;
}

/**
 * Turn time (minutes) — how long a booking occupies its seats. Drives the
 * sliding-window availability check so overlapping starts can't reuse seats.
 */
export async function getTurnMinutes(restaurantId: string): Promise<number> {
  const [r] = await db
    .select({ turn: restaurants.reservationTurnMinutes })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return r?.turn && r.turn > 0 ? r.turn : 90;
}

export type CapacityMode = "seats" | "tables";

/** Restaurant-level reservation config that drives which capacity model to use. */
export async function getReservationConfig(
  restaurantId: string,
): Promise<{ mode: CapacityMode; maxJoin: number; advanceDays: number; turn: number }> {
  const [r] = await db
    .select({
      mode: restaurants.reservationCapacityMode,
      maxJoin: restaurants.reservationMaxJoin,
      advanceDays: restaurants.reservationAdvanceDays,
      turn: restaurants.reservationTurnMinutes,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return {
    mode: r?.mode === "tables" ? "tables" : "seats",
    maxJoin: r?.maxJoin && r.maxJoin > 0 ? r.maxJoin : 2,
    advanceDays: r?.advanceDays && r.advanceDays > 0 ? r.advanceDays : 60,
    turn: r?.turn && r.turn > 0 ? r.turn : 90,
  };
}

export type ResTable = { id: string; label: string; seats: number; joinable: boolean; area: string | null };

/** Active reservation tables for a restaurant, optionally filtered to an area. */
export async function getReservationTables(restaurantId: string, area?: Area): Promise<ResTable[]> {
  const rows = await db
    .select({ id: reservationTables.id, label: reservationTables.label, seats: reservationTables.seats, joinable: reservationTables.joinable, area: reservationTables.area })
    .from(reservationTables)
    .where(and(eq(reservationTables.restaurantId, restaurantId), eq(reservationTables.isActive, true)));
  return area ? rows.filter((t) => t.area === area) : rows;
}

/** A join-group: the tables that can physically be pushed together. */
export type TableGroup = { id: string; label: string; tableIds: string[] };

/** Join-groups for a restaurant (each with its member table ids). */
export async function getReservationTableGroups(restaurantId: string): Promise<TableGroup[]> {
  const rows = await db
    .select({ groupId: reservationTableGroups.id, label: reservationTableGroups.label, tableId: reservationTableGroupMembers.tableId })
    .from(reservationTableGroups)
    .leftJoin(reservationTableGroupMembers, eq(reservationTableGroupMembers.groupId, reservationTableGroups.id))
    .where(eq(reservationTableGroups.restaurantId, restaurantId));
  const map = new Map<string, TableGroup>();
  for (const r of rows) {
    let g = map.get(r.groupId);
    if (!g) { g = { id: r.groupId, label: r.label, tableIds: [] }; map.set(r.groupId, g); }
    if (r.tableId) g.tableIds.push(r.tableId);
  }
  return [...map.values()];
}

/**
 * Choose table(s) to seat a party from a set of FREE tables, or null if none fit.
 * Policy: prefer the smallest single table that fits (least waste); a party is only
 * put on a bigger table when nothing smaller is free, and never refused while a fit
 * exists. If no single table fits, combine tables:
 *   • within a join-GROUP — free JOINABLE members of the same group, up to ALL of
 *     them (the group size is the cap; the global maxJoin does not limit inside a group);
 *   • else the loose pool — free `joinable` tables in NO group, up to `maxJoin`.
 * Among all fitting combinations the least-waste one wins (fewest tables, then fewest
 * seats). No groups → only the loose pool runs = the original behaviour. Pure — no I/O.
 */
export function canSeat(partySize: number, free: ResTable[], maxJoin: number, groups: TableGroup[] = []): string[] | null {
  // 1. Smallest single table that fits (considers all free tables, joinable or not).
  const single = [...free].sort((a, b) => a.seats - b.seats).find((t) => t.seats >= partySize);
  if (single) return [single.id];

  const freeById = new Map(free.map((t) => [t.id, t]));
  const candidates: ResTable[][] = [];

  // Greedily combine tables largest-first until they seat the party; `cap` bounds how
  // many may combine. Returns the picked tables, or null if they can't reach the party.
  const combine = (pool: ResTable[], cap: number): ResTable[] | null => {
    const sorted = [...pool].sort((a, b) => b.seats - a.seats);
    const picked: ResTable[] = [];
    let sum = 0;
    for (const t of sorted) {
      if (picked.length >= cap) break;
      picked.push(t);
      sum += t.seats;
      if (sum >= partySize) return picked;
    }
    return null;
  };

  // 2. Within each group: free JOINABLE members, up to ALL of them (group size is the
  //    cap). "se poate uni" is the master switch — a non-joinable table is never
  //    combined, even if it's still listed in a group.
  for (const g of groups) {
    const members = g.tableIds.map((id) => freeById.get(id)).filter((t): t is ResTable => !!t && t.joinable);
    const combo = combine(members, members.length);
    if (combo) candidates.push(combo);
  }

  // 3. Loose pool: free joinable tables in NO group, up to the global maxJoin.
  const grouped = new Set(groups.flatMap((g) => g.tableIds));
  const loose = free.filter((t) => t.joinable && !grouped.has(t.id));
  const looseCombo = combine(loose, maxJoin);
  if (looseCombo) candidates.push(looseCombo);

  if (candidates.length === 0) return null;

  // 4. Least waste: fewest tables, then fewest total seats.
  candidates.sort((a, b) =>
    a.length !== b.length
      ? a.length - b.length
      : a.reduce((s, t) => s + t.seats, 0) - b.reduce((s, t) => s + t.seats, 0)
  );
  return candidates[0].map((t) => t.id);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The seat capacity of a window for the given area (or single capacity when null). */
function windowCapacity(h: ReservationHour, area?: Area): number {
  if (area === "inside") return h.seatsInside ?? 0;
  if (area === "outside") return h.seatsOutside ?? 0;
  return h.seatsPerSlot;
}

/**
 * Every selectable "HH:MM" slot on one day, each with the seat capacity of the
 * window it belongs to (for the given area, or single capacity). Overlapping
 * windows: the larger capacity wins.
 */
export function slotsWithCapacity(hours: ReservationHour[], area?: Area): Map<string, number> {
  const caps = new Map<string, number>();
  for (const h of hours) {
    const start = toMinutes(h.startTime);
    const end = toMinutes(h.endTime);
    const step = h.slotMinutes > 0 ? h.slotMinutes : 30;
    const cap = windowCapacity(h, area);
    // The interval end is the LAST seating time (inclusive) — a booking at the end
    // still runs its turn time past close. So a 10:00–20:00 window is bookable at
    // 20:00. (capacityAt below is likewise inclusive of the end so this is enforced.)
    for (let t = start; t <= end; t += step) {
      const key = toHHMM(t);
      caps.set(key, Math.max(caps.get(key) ?? 0, cap));
    }
  }
  return caps;
}

/** Plain sorted list of a day's slot times (no capacity). */
export function slotsForDay(hours: ReservationHour[]): string[] {
  return [...slotsWithCapacity(hours).keys()].sort();
}

// Capacity-check tick granularity for the sliding window. Bookings' occupancy
// windows are evaluated at every TICK minutes so an overlapping start can't reuse
// seats held by an earlier, still-seated party.
const CAPACITY_TICK = 15;

// Reservations are wall-clock local to the venue (Brașov). "Today" and past-slot
// checks must use THIS timezone, never the server's UTC — otherwise the small hours
// roll the date (the same class of bug the booking form's date chips had).
const RESERVATION_TZ = "Europe/Bucharest";

/** Current { date: "YYYY-MM-DD", minutes: since local midnight } in the venue TZ. */
function nowInReservationTZ(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESERVATION_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some ICU builds render local midnight as "24"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + parseInt(get("minute"), 10) };
}

/** Hide slots earlier than now WHEN dateStr is today (venue TZ). Other days pass
 *  through untouched; a slot at exactly the current minute is kept. */
function dropPastSlotsForToday(dateStr: string, slots: string[]): string[] {
  const now = nowInReservationTZ();
  if (dateStr !== now.date) return slots;
  return slots.filter((s) => toMinutes(s) >= now.minutes);
}

/**
 * Live availability for a date + party size (+ optional area), using a SLIDING
 * WINDOW based on the restaurant's turn time. Each pending/confirmed booking holds
 * its seats across [start, start + turn). A candidate start T is bookable only if,
 * at every 15-min tick within [T, T + turn), the seats consumed by overlapping
 * bookings (in the requested area when given) plus this party fit the tick's
 * capacity. Returns the passing start times, sorted.
 */
export async function availableSlotsForDay(
  restaurantId: string,
  dateStr: string,
  partySize: number,
  area?: Area,
  // When re-checking availability for an EDIT, exclude that reservation so it
  // doesn't count its own (old) slot against itself.
  excludeReservationId?: string,
): Promise<string[]> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (hours.length === 0) return [];

  // Tables mode uses the table-inventory algorithm instead of the seat pool.
  const { mode, maxJoin, turn: turnCfg } = await getReservationConfig(restaurantId);
  if (mode === "tables") {
    return dropPastSlotsForToday(dateStr, await availableSlotsForDayTables(restaurantId, dateStr, partySize, hours, maxJoin, turnCfg, area, excludeReservationId));
  }

  const caps = slotsWithCapacity(hours, area); // candidate start times → window capacity
  const turn = await getTurnMinutes(restaurantId);

  const booked = await db
    .select({ time: reservations.time, partySize: reservations.partySize, area: reservations.area })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
        excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
      )
    );

  // Existing occupancy as [startMin, endMin) windows (same-area only when given).
  const windows = booked
    .filter((b) => !area || b.area === area)
    .map((b) => ({ start: toMinutes(b.time), end: toMinutes(b.time) + turn, size: b.partySize }));

  // Seats already held at a given minute by overlapping bookings.
  const takenAt = (tick: number) =>
    windows.reduce((sum, w) => (tick >= w.start && tick < w.end ? sum + w.size : sum), 0);

  // Capacity that applies at an arbitrary minute — the max window capacity covering
  // it (mirrors slotsWithCapacity's "larger window wins"); 0 outside all windows.
  // End is inclusive so a booking AT the window's last seating time is still capped
  // (all bookings overlapping it started at/before that tick, so it's enough).
  const capacityAt = (tick: number) => {
    let cap = 0;
    for (const h of hours) {
      const s = toMinutes(h.startTime);
      const e = toMinutes(h.endTime);
      if (tick >= s && tick <= e) cap = Math.max(cap, windowCapacity(h, area));
    }
    return cap;
  };

  const result: string[] = [];
  for (const [time] of caps) {
    const startMin = toMinutes(time);
    const windowEnd = startMin + turn;
    let fits = true;
    for (let t = startMin; t < windowEnd; t += CAPACITY_TICK) {
      const cap = capacityAt(t);
      // Outside opening hours the seat pool is 0 → seating there still counts as the
      // party occupying the room; only enforce capacity where a window defines one.
      if (cap > 0 && takenAt(t) + partySize > cap) { fits = false; break; }
    }
    if (fits) result.push(time);
  }
  return dropPastSlotsForToday(dateStr, result.sort());
}

/** Parse a reservation's assignedTableIds JSON into a string[] (empty on null/bad). */
function parseTableIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * TABLES-MODE availability. Each pending/confirmed booking occupies its assigned
 * table(s) across [start, start+turn). A candidate start T is offered only if the
 * tables NOT busy during [T, T+turn) can seat the party (a single free table, or a
 * join of free joinable tables). Bookings with no assigned tables (e.g. made in
 * seats mode, or a staff force-override) occupy nothing here.
 */
async function availableSlotsForDayTables(
  restaurantId: string,
  dateStr: string,
  partySize: number,
  hours: ReservationHour[],
  maxJoin: number,
  turn: number,
  area?: Area,
  excludeReservationId?: string,
): Promise<string[]> {
  const tables = await getReservationTables(restaurantId, area);
  if (tables.length === 0) return [];
  const groups = await getReservationTableGroups(restaurantId);

  const booked = await db
    .select({ time: reservations.time, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
        excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
      ),
    );
  const windows = booked.map((b) => ({ start: toMinutes(b.time), end: toMinutes(b.time) + turn, tableIds: parseTableIds(b.assignedTableIds) }));

  const slots = [...slotsWithCapacity(hours, area).keys()];
  const result: string[] = [];
  for (const time of slots) {
    const start = toMinutes(time);
    const end = start + turn;
    // Tables busy at any point overlapping [start, end).
    const busy = new Set<string>();
    for (const w of windows) {
      if (start < w.end && w.start < end) w.tableIds.forEach((id) => busy.add(id));
    }
    const free = tables.filter((t) => !busy.has(t.id));
    if (canSeat(partySize, free, maxJoin, groups)) result.push(time);
  }
  return result.sort();
}

/**
 * Pick the actual table(s) to seat a party at a specific date/time, or null when
 * none is available — the booking-time counterpart of availableSlotsForDayTables.
 * Verifies the time is a real slot, then computes free tables for its turn window.
 */
export async function assignTablesFor(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  area?: Area,
  excludeReservationId?: string,
): Promise<string[] | null> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (hours.length === 0) return null;
  if (!slotsWithCapacity(hours, area).has(time)) return null;

  const { maxJoin, turn } = await getReservationConfig(restaurantId);
  const tables = await getReservationTables(restaurantId, area);
  if (tables.length === 0) return null;
  const groups = await getReservationTableGroups(restaurantId);

  const booked = await db
    .select({ time: reservations.time, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
        excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
      ),
    );

  const start = toMinutes(time);
  const end = start + turn;
  const busy = new Set<string>();
  for (const b of booked) {
    const bs = toMinutes(b.time);
    if (start < bs + turn && bs < end) parseTableIds(b.assignedTableIds).forEach((id) => busy.add(id));
  }
  const free = tables.filter((t) => !busy.has(t.id));
  return canSeat(partySize, free, maxJoin, groups);
}

/**
 * For one time, which areas still have room for the party — powers the
 * "the other area is free at this hour" hint. Only meaningful when areas are on.
 */
export async function slotAreaAvailability(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
): Promise<{ inside: boolean; outside: boolean }> {
  const [inside, outside] = await Promise.all([
    availableSlotsForDay(restaurantId, dateStr, partySize, "inside"),
    availableSlotsForDay(restaurantId, dateStr, partySize, "outside"),
  ]);
  return { inside: inside.includes(time), outside: outside.includes(time) };
}

/**
 * Server-side validity check at booking time (re-checked to prevent oversell):
 * party within the restaurant cap, and the slot has enough seats for this party in
 * the chosen area (or single capacity when areas are off).
 */
export async function validateBooking(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  area?: Area,
  excludeReservationId?: string,
): Promise<{ ok: boolean; reason?: string; assignedTableIds?: string[] }> {
  const cap = await getMaxPartySize(restaurantId);
  if (partySize < 1 || partySize > cap) {
    return { ok: false, reason: `Numărul de persoane trebuie să fie între 1 și ${cap}.` };
  }
  // When areas are on, an area is required.
  if (await areasEnabled(restaurantId)) {
    if (area !== "inside" && area !== "outside") {
      return { ok: false, reason: "Alege zona (interior sau terasă)." };
    }
  }

  // Tables mode: re-check by picking an actual free table (or join) at this exact
  // time, and return the assignment so the caller can persist it on the booking.
  const { mode } = await getReservationConfig(restaurantId);
  if (mode === "tables") {
    const assigned = await assignTablesFor(restaurantId, dateStr, time, partySize, area, excludeReservationId);
    if (!assigned) {
      return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă. Alege altă oră." };
    }
    return { ok: true, assignedTableIds: assigned };
  }

  const available = await availableSlotsForDay(restaurantId, dateStr, partySize, area, excludeReservationId);
  if (!available.includes(time)) {
    return { ok: false, reason: "Ora selectată nu mai este disponibilă. Alege altă oră." };
  }
  return { ok: true };
}

/**
 * Staff-created reservation (someone called). Confirmed immediately. Respects the
 * slot's remaining seats unless `force` is set (staff know the real floor). Returns
 * the seats remaining before insert so the caller can warn on an override.
 */
export async function createManualReservation(
  restaurantId: string,
  input: { date: string; time: string; partySize: number; guestName: string; guestPhone: string; note?: string; area?: Area },
  force: boolean,
): Promise<{ ok: true } | { ok: false; reason: string; overridable?: boolean }> {
  if (input.partySize < 1) return { ok: false, reason: "Număr de persoane invalid." };

  const withAreas = await areasEnabled(restaurantId);
  const area = withAreas ? input.area : undefined;
  if (withAreas && area !== "inside" && area !== "outside") {
    return { ok: false, reason: "Alege zona (interior sau terasă)." };
  }

  // Slot must exist in the day's hours (even a forced booking needs a real time).
  const day = new Date(`${input.date}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  const caps = slotsWithCapacity(hours, area);
  if (!caps.has(input.time)) {
    return { ok: false, reason: "Ora nu este într-un interval de program." };
  }

  // Capacity check — unless forced. In tables mode this also picks the table(s).
  const { mode } = await getReservationConfig(restaurantId);
  let assignedTableIds: string[] | null = null;
  if (!force) {
    if (mode === "tables") {
      const assigned = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area);
      if (!assigned) {
        return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă.", overridable: true };
      }
      assignedTableIds = assigned;
    } else {
      const available = await availableSlotsForDay(restaurantId, input.date, input.partySize, area);
      if (!available.includes(input.time)) {
        return { ok: false, reason: "Slotul este plin pentru acest număr de persoane.", overridable: true };
      }
    }
  } else if (mode === "tables") {
    // Forced booking: still try to attach a free table if one fits, but don't block.
    assignedTableIds = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area);
  }

  await db.insert(reservations).values({
    restaurantId,
    date: input.date,
    time: input.time,
    partySize: input.partySize,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: null,
    area: area ?? null,
    assignedTableIds: assignedTableIds ? JSON.stringify(assignedTableIds) : null,
    status: "confirmed", // staff take it live → already confirmed
    note: input.note || null,
  });
  return { ok: true };
}

/**
 * Restaurant edits a reservation's date / time / party size (not name/phone). Keeps
 * the existing area. Re-validates capacity EXCLUDING this reservation (so nudging it
 * within its own window doesn't self-conflict); `force` overrides a full slot like a
 * manual booking. In tables mode the assignment is recomputed. Fires the "reservation
 * updated" email (best-effort) and reports whether the guest is reachable by email
 * (the board phones them otherwise). Only pending/confirmed rows are editable.
 */
export async function updateReservation(
  restaurantId: string,
  reservationId: string,
  input: { date: string; time: string; partySize: number },
  force: boolean,
): Promise<{ ok: true; notifiableByEmail: boolean } | { ok: false; reason: string; overridable?: boolean }> {
  const [res] = await db
    .select({
      status: reservations.status,
      area: reservations.area,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      userId: reservations.userId,
      restaurantName: restaurants.name,
    })
    .from(reservations)
    .innerJoin(restaurants, eq(reservations.restaurantId, restaurants.id))
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res) return { ok: false, reason: "Rezervare negăsită." };
  if (res.status !== "pending" && res.status !== "confirmed") {
    return { ok: false, reason: "Rezervarea nu mai poate fi modificată." };
  }

  if (input.partySize < 1) return { ok: false, reason: "Număr de persoane invalid." };
  const cap = await getMaxPartySize(restaurantId);
  if (input.partySize > cap) return { ok: false, reason: `Numărul de persoane trebuie să fie între 1 și ${cap}.` };

  // No moving into the past (Bucharest-local day).
  if (input.date < nowInReservationTZ().date) return { ok: false, reason: "Data trebuie să fie în viitor." };

  const area = (res.area as Area | null) ?? undefined;

  // The new time must fall within the day's program.
  const day = new Date(`${input.date}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (!slotsWithCapacity(hours, area).has(input.time)) {
    return { ok: false, reason: "Ora nu este într-un interval de program." };
  }

  // Capacity check EXCLUDING this reservation — unless forced. Tables mode re-picks table(s).
  const { mode } = await getReservationConfig(restaurantId);
  let assignedTableIds: string[] | null = null;
  if (!force) {
    if (mode === "tables") {
      const assigned = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, reservationId);
      if (!assigned) {
        return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă.", overridable: true };
      }
      assignedTableIds = assigned;
    } else {
      const available = await availableSlotsForDay(restaurantId, input.date, input.partySize, area, reservationId);
      if (!available.includes(input.time)) {
        return { ok: false, reason: "Slotul este plin pentru acest număr de persoane.", overridable: true };
      }
    }
  } else if (mode === "tables") {
    assignedTableIds = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, reservationId);
  }

  await db
    .update(reservations)
    .set({
      date: input.date,
      time: input.time,
      partySize: input.partySize,
      assignedTableIds: mode === "tables" ? (assignedTableIds ? JSON.stringify(assignedTableIds) : null) : null,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  void notifyReservationUpdated(res, input);
  return { ok: true, notifiableByEmail: !!res.guestEmail || !!res.userId };
}

/** Upcoming reservations for the board (today onward, excluding declined). */
export async function listUpcomingReservations(restaurantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  // The client's private CRM note (read-only on the board), resolved by account
  // (userId) or, for accountless diners, by phone — each at most one row (partial
  // unique indexes), so these left joins never multiply reservation rows.
  const cnUser = alias(restaurantClientNotes, "cn_user");
  const cnPhone = alias(restaurantClientNotes, "cn_phone");
  const rows = await db
    .select({
      id: reservations.id,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
      guestEmail: reservations.guestEmail,
      status: reservations.status,
      area: reservations.area,
      assignedTableIds: reservations.assignedTableIds,
      note: reservations.note,
      clientNote: sql<string | null>`coalesce(${cnUser.note}, ${cnPhone.note})`,
      // False only when there's no way to email the guest (no booking email AND no
      // linked account) — the board then prompts staff to phone them on confirm.
      notifiableByEmail: sql<boolean>`(${reservations.guestEmail} is not null or ${reservations.userId} is not null)`,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .leftJoin(cnUser, and(eq(cnUser.restaurantId, restaurantId), eq(cnUser.userId, reservations.userId)))
    .leftJoin(cnPhone, and(eq(cnPhone.restaurantId, restaurantId), isNull(reservations.userId), eq(cnPhone.guestPhone, phoneDigits(reservations.guestPhone))))
    .where(and(eq(reservations.restaurantId, restaurantId), gte(reservations.date, today), ne(reservations.status, "declined")))
    .orderBy(asc(reservations.date), asc(reservations.time));

  // Resolve assigned table ids → labels once (tables mode board display).
  const anyAssigned = rows.some((r) => r.assignedTableIds);
  const labelById = new Map<string, string>();
  if (anyAssigned) {
    const tbls = await db
      .select({ id: reservationTables.id, label: reservationTables.label })
      .from(reservationTables)
      .where(eq(reservationTables.restaurantId, restaurantId));
    tbls.forEach((t) => labelById.set(t.id, t.label));
  }
  return rows.map(({ assignedTableIds, ...r }) => ({
    ...r,
    tables: parseTableIds(assignedTableIds).map((id) => labelById.get(id) ?? "?").filter(Boolean),
  }));
}

/** Phone identity for CRM notes — compared without formatting so `0740 111 222`
 * and `0740111222` count as the same person. `normPhone` is the JS form (dedup +
 * note key); `phoneDigits` is the equivalent SQL for grouping/joining. Both strip
 * every non-digit, so they always agree on the canonical value. */
const normPhone = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");
const phoneDigits = (col: AnyColumn) => sql`regexp_replace(${col}, '[^0-9]', '', 'g')`;

export type RestaurantClient = {
  /** true = accountless diner (keyed by phone); false = account-holder (keyed by userId). */
  isGuest: boolean;
  userId: string | null;
  phone: string | null;
  name: string | null;
  visits: number;
  lastVisit: string;
  note: string;
};

/**
 * Restaurant CRM client list — every diner who has reserved here, one row per
 * identity: account-holders by userId, accountless diners by phone, each with
 * their private note left-joined. A guest booking under an account's phone
 * collapses into that account. Merged, searched and paginated in memory (a single
 * restaurant's distinct clients is a small set). Used by the owner Clienți page.
 */
export async function listRestaurantClients(
  restaurantId: string,
  { query = "", page = 1, perPage = 20 }: { query?: string; page?: number; perPage?: number } = {},
): Promise<{ clients: RestaurantClient[]; total: number; totalPages: number }> {
  const [accountRows, guestRows] = await Promise.all([
    db
      .select({
        userId: reservations.userId,
        name: users.name,
        phone: sql<string | null>`coalesce(${users.phone}, max(${reservations.guestPhone}))`,
        visits: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${reservations.date})`,
        note: restaurantClientNotes.note,
      })
      .from(reservations)
      .innerJoin(users, eq(reservations.userId, users.id))
      .leftJoin(
        restaurantClientNotes,
        and(eq(restaurantClientNotes.restaurantId, restaurantId), eq(restaurantClientNotes.userId, reservations.userId)),
      )
      .where(and(eq(reservations.restaurantId, restaurantId), isNotNull(reservations.userId)))
      .groupBy(reservations.userId, users.name, users.phone, restaurantClientNotes.note),
    db
      .select({
        // Grouped by digits-only phone, so "0740 111 222" and "0740111222" are one
        // person. Display phone + name come from the MOST RECENT booking (not an
        // arbitrary max), so a renamed guest shows their latest name.
        phone: sql<string | null>`(array_agg(${reservations.guestPhone} order by ${reservations.date} desc, ${reservations.createdAt} desc))[1]`,
        name: sql<string | null>`(array_agg(${reservations.guestName} order by ${reservations.date} desc, ${reservations.createdAt} desc))[1]`,
        visits: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${reservations.date})`,
        note: restaurantClientNotes.note,
      })
      .from(reservations)
      .leftJoin(
        restaurantClientNotes,
        and(eq(restaurantClientNotes.restaurantId, restaurantId), eq(restaurantClientNotes.guestPhone, phoneDigits(reservations.guestPhone))),
      )
      .where(and(eq(reservations.restaurantId, restaurantId), isNull(reservations.userId), isNotNull(reservations.guestPhone)))
      .groupBy(phoneDigits(reservations.guestPhone), restaurantClientNotes.note),
  ]);

  const accountPhones = new Set(accountRows.map((r) => normPhone(r.phone)).filter(Boolean));
  let merged: RestaurantClient[] = [
    ...accountRows.map((r) => ({
      isGuest: false, userId: r.userId, phone: r.phone, name: r.name, visits: r.visits, lastVisit: r.lastVisit, note: r.note ?? "",
    })),
    ...guestRows
      .filter((r) => r.phone && !accountPhones.has(normPhone(r.phone)))
      .map((r) => ({
        isGuest: true, userId: null, phone: r.phone, name: r.name, visits: r.visits, lastVisit: r.lastVisit, note: r.note ?? "",
      })),
  ].sort((a, b) => (a.lastVisit < b.lastVisit ? 1 : a.lastVisit > b.lastVisit ? -1 : 0));

  const q = query.trim().toLowerCase();
  if (q) merged = merged.filter((r) => (r.name ?? "").toLowerCase().includes(q) || (r.phone ?? "").toLowerCase().includes(q));

  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const clients = merged.slice((page - 1) * perPage, page * perPage);
  return { clients, total, totalPages };
}

/**
 * Upsert a restaurant's private note about a client — keyed by account (userId) or,
 * for an accountless diner, by phone. Exactly one identity. The note persists across
 * that identity's repeat bookings. Callers must authorise (owner/admin) first.
 */
export async function upsertRestaurantClientNote(
  restaurantId: string,
  identity: { userId: string } | { phone: string },
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  const userId = "userId" in identity ? identity.userId : null;
  // Store the note under the digits-only phone so it matches every formatting of it.
  const guestPhone = "phone" in identity ? normPhone(identity.phone) : null;
  const match = userId
    ? eq(restaurantClientNotes.userId, userId)
    : eq(restaurantClientNotes.guestPhone, guestPhone!);

  const [existing] = await db
    .select({ id: restaurantClientNotes.id })
    .from(restaurantClientNotes)
    .where(and(eq(restaurantClientNotes.restaurantId, restaurantId), match))
    .limit(1);

  if (existing) {
    await db.update(restaurantClientNotes).set({ note: trimmed, updatedAt: new Date() }).where(eq(restaurantClientNotes.id, existing.id));
  } else {
    await db.insert(restaurantClientNotes).values({ restaurantId, userId, guestPhone, note: trimmed });
  }
}

/**
 * Set a reservation's status (confirmed | declined | cancelled) after verifying it
 * belongs to the given restaurant. When the guest gave an email (or is linked to an
 * account), a confirmed/declined email is sent — best-effort, never blocks the
 * status change. Guests without an email are contacted by phone. Returns false if
 * the reservation isn't found.
 */
export async function setReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: "confirmed" | "declined" | "cancelled",
): Promise<boolean> {
  const [res] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      userId: reservations.userId,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      restaurantName: restaurants.name,
    })
    .from(reservations)
    .innerJoin(restaurants, eq(reservations.restaurantId, restaurants.id))
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res) return false;

  await db
    .update(reservations)
    .set({ status, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  // Notify the guest by email on every status change — confirm, decline or cancel —
  // if we have one (booking email, else the linked account's email). Fire-and-forget;
  // email failure never blocks. Guests with no email are phoned by staff (board modal).
  void notifyReservationStatus(res, status);
  return true;
}

/** Resolve a reservation's contact email — the booking email, else the linked account's. */
async function resolveGuestEmail(res: { guestEmail: string | null; userId: string | null }): Promise<string | null> {
  if (res.guestEmail) return res.guestEmail;
  if (res.userId) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, res.userId)).limit(1);
    return u?.email ?? null;
  }
  return null;
}

/** Email the guest about a status change (confirm/decline/cancel). Best-effort. */
async function notifyReservationStatus(
  res: { guestName: string; guestEmail: string | null; userId: string | null; date: string; time: string; partySize: number; restaurantName: string },
  status: "confirmed" | "declined" | "cancelled",
): Promise<void> {
  try {
    const email = await resolveGuestEmail(res);
    if (!email) return;
    const data = {
      restaurantName: res.restaurantName,
      date: res.date,
      time: res.time,
      partySize: res.partySize,
      guestName: res.guestName,
    };
    if (status === "confirmed") await sendReservationConfirmedEmail(email, data);
    else if (status === "declined") await sendReservationDeclinedEmail(email, data);
    else await sendReservationCancelledEmail(email, data);
  } catch {
    /* email is best-effort — never block the status change */
  }
}

/** Email the guest that their reservation's date/time/party changed. Best-effort. */
async function notifyReservationUpdated(
  res: { guestName: string; guestEmail: string | null; userId: string | null; restaurantName: string },
  next: { date: string; time: string; partySize: number },
): Promise<void> {
  try {
    const email = await resolveGuestEmail(res);
    if (!email) return;
    await sendReservationUpdatedEmail(email, {
      restaurantName: res.restaurantName,
      date: next.date,
      time: next.time,
      partySize: next.partySize,
      guestName: res.guestName,
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Link anonymous reservations to a newly-created/confirmed account by matching the
 * booking's guest email to the account's (verified) email. Called on signup/confirm
 * so a table booked while logged out shows up in the user's account. Case-insensitive;
 * only touches rows with no userId yet. Best-effort.
 */
export async function linkAnonReservations(userId: string, email: string): Promise<void> {
  await db
    .update(reservations)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        sql`lower(${reservations.guestEmail}) = ${email.toLowerCase()}`,
        isNull(reservations.userId),
      )
    );
}

/**
 * A user cancels their OWN reservation. Verifies the reservation belongs to the
 * user and is still cancellable (pending/confirmed). Cancelling frees the seats
 * (availability counts only pending+confirmed). Returns the place slug so the UI
 * can offer "cancel & rebook".
 */
export async function cancelOwnReservation(
  userId: string,
  reservationId: string,
): Promise<{ ok: true; placeSlug: string | null } | { ok: false; reason: string }> {
  const [res] = await db
    .select({ id: reservations.id, status: reservations.status, restaurantId: reservations.restaurantId })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.userId, userId)))
    .limit(1);
  if (!res) return { ok: false, reason: "Rezervare negăsită." };
  if (res.status !== "pending" && res.status !== "confirmed") {
    return { ok: false, reason: "Rezervarea nu mai poate fi anulată." };
  }

  await db
    .update(reservations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  // The linked place slug (for the rebook link).
  const [r] = await db
    .select({ placeId: restaurants.placeId })
    .from(restaurants)
    .where(eq(restaurants.id, res.restaurantId))
    .limit(1);
  let placeSlug: string | null = null;
  if (r?.placeId) {
    const [p] = await db.select({ slug: places.slug }).from(places).where(eq(places.id, r.placeId)).limit(1);
    placeSlug = p?.slug ?? null;
  }
  return { ok: true, placeSlug };
}
