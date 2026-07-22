import { db } from "@/lib/db";
import { restaurants, reservationHours, reservations, reservationTables, adminAuditLog, places, users } from "@/lib/db/schema";
import { eq, and, gte, ne, asc, inArray, isNull, sql } from "drizzle-orm";
import { sendReservationConfirmedEmail, sendReservationDeclinedEmail } from "@/lib/email";
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

/**
 * Choose table(s) to seat a party from a set of FREE tables, or null if none fit.
 * Policy: prefer the smallest single table that fits (least waste); a party is only
 * put on a bigger table when nothing smaller is free, and never refused while a fit
 * exists. If no single table fits, combine free *joinable* tables (largest-first, up
 * to `maxJoin`) until their seats sum to the party. Pure — no I/O.
 */
export function canSeat(partySize: number, free: ResTable[], maxJoin: number): string[] | null {
  // Smallest single table that fits (considers all free tables, joinable or not).
  const single = [...free].sort((a, b) => a.seats - b.seats).find((t) => t.seats >= partySize);
  if (single) return [single.id];

  // Otherwise combine joinable free tables, largest first, up to maxJoin.
  const joinables = free.filter((t) => t.joinable).sort((a, b) => b.seats - a.seats);
  const picked: ResTable[] = [];
  let sum = 0;
  for (const t of joinables) {
    picked.push(t);
    sum += t.seats;
    if (sum >= partySize) return picked.map((p) => p.id);
    if (picked.length >= maxJoin) break;
  }
  return null;
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
    for (let t = start; t <= end - step; t += step) {
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
): Promise<string[]> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (hours.length === 0) return [];

  // Tables mode uses the table-inventory algorithm instead of the seat pool.
  const { mode, maxJoin, turn: turnCfg } = await getReservationConfig(restaurantId);
  if (mode === "tables") {
    return availableSlotsForDayTables(restaurantId, dateStr, partySize, hours, maxJoin, turnCfg, area);
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
  const capacityAt = (tick: number) => {
    let cap = 0;
    for (const h of hours) {
      const s = toMinutes(h.startTime);
      const e = toMinutes(h.endTime);
      if (tick >= s && tick < e) cap = Math.max(cap, windowCapacity(h, area));
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
  return result.sort();
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
): Promise<string[]> {
  const tables = await getReservationTables(restaurantId, area);
  if (tables.length === 0) return [];

  const booked = await db
    .select({ time: reservations.time, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
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
    if (canSeat(partySize, free, maxJoin)) result.push(time);
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
): Promise<string[] | null> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (hours.length === 0) return null;
  if (!slotsWithCapacity(hours, area).has(time)) return null;

  const { maxJoin, turn } = await getReservationConfig(restaurantId);
  const tables = await getReservationTables(restaurantId, area);
  if (tables.length === 0) return null;

  const booked = await db
    .select({ time: reservations.time, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
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
  return canSeat(partySize, free, maxJoin);
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
    const assigned = await assignTablesFor(restaurantId, dateStr, time, partySize, area);
    if (!assigned) {
      return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă. Alege altă oră." };
    }
    return { ok: true, assignedTableIds: assigned };
  }

  const available = await availableSlotsForDay(restaurantId, dateStr, partySize, area);
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

/** Upcoming reservations for the board (today onward, excluding declined). */
export async function listUpcomingReservations(restaurantId: string) {
  const today = new Date().toISOString().slice(0, 10);
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
      createdAt: reservations.createdAt,
    })
    .from(reservations)
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

  // Notify the guest by email on confirm/decline — if we have one (booking email,
  // else the linked account's email). Fire-and-forget; email failure never blocks.
  if (status === "confirmed" || status === "declined") {
    void notifyReservationStatus(res, status);
  }
  return true;
}

/** Resolve the guest's email (booking email or linked account) and send the email. */
async function notifyReservationStatus(
  res: { guestName: string; guestEmail: string | null; userId: string | null; date: string; time: string; partySize: number; restaurantName: string },
  status: "confirmed" | "declined",
): Promise<void> {
  try {
    let email = res.guestEmail;
    if (!email && res.userId) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, res.userId)).limit(1);
      email = u?.email ?? null;
    }
    if (!email) return;

    const data = {
      restaurantName: res.restaurantName,
      date: res.date,
      time: res.time,
      partySize: res.partySize,
      guestName: res.guestName,
    };
    if (status === "confirmed") await sendReservationConfirmedEmail(email, data);
    else await sendReservationDeclinedEmail(email, data);
  } catch {
    /* email is best-effort — never block the status change */
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
