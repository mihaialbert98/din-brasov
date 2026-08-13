import { db } from "@/lib/db";
import { restaurants, reservationHours, reservationClosures, reservations, reservationTables, reservationTableGroups, reservationTableGroupMembers, restaurantClientNotes, adminAuditLog, places, users } from "@/lib/db/schema";
import { eq, and, gte, lte, ne, asc, inArray, isNull, isNotNull, sql, type AnyColumn } from "drizzle-orm";
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
  enabled: boolean;
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
      enabled: reservationHours.enabled,
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

export type CapacityMode = "seats" | "tables";

/**
 * Who is booking. "online" = the public form: held-back tables are invisible and a
 * closed date offers nothing. "staff" = owner/waiter: they see the whole floor and
 * may override a closed date, because they know what's actually happening in the room.
 */
export type BookingChannel = "online" | "staff";

export type ReservationConfig = {
  mode: CapacityMode;
  maxJoin: number;
  advanceDays: number;
  /** Standard turn (minutes) — how long an ordinary booking holds its seats. */
  turn: number;
  /** Optional longer turn for big parties. `minutes` is never below `turn`. */
  longTurn: { enabled: boolean; fromParty: number; minutes: number };
  allowReducedTurn: boolean;
  showDuration: boolean;
  /** Auto-confirm only: whether the success screen mentions the confirmation email. */
  showEmailNotice: boolean;
};

/** Restaurant-level reservation config that drives which capacity model to use. */
export async function getReservationConfig(restaurantId: string): Promise<ReservationConfig> {
  const [r] = await db
    .select({
      mode: restaurants.reservationCapacityMode,
      maxJoin: restaurants.reservationMaxJoin,
      advanceDays: restaurants.reservationAdvanceDays,
      turn: restaurants.reservationTurnMinutes,
      longEnabled: restaurants.reservationLongTurnEnabled,
      longFrom: restaurants.reservationLongTurnFromParty,
      longMinutes: restaurants.reservationLongTurnMinutes,
      allowReduced: restaurants.reservationAllowReducedTurn,
      showDuration: restaurants.reservationShowDuration,
      showEmailNotice: restaurants.reservationShowEmailNotice,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const turn = r?.turn && r.turn > 0 ? r.turn : 90;
  return {
    mode: r?.mode === "tables" ? "tables" : "seats",
    maxJoin: r?.maxJoin && r.maxJoin > 0 ? r.maxJoin : 2,
    advanceDays: r?.advanceDays && r.advanceDays > 0 ? r.advanceDays : 60,
    turn,
    longTurn: {
      enabled: !!r?.longEnabled,
      fromParty: r?.longFrom && r.longFrom > 1 ? r.longFrom : 6,
      // Clamped so a misconfigured "long" turn shorter than the standard one can't
      // invert the rule (the reduced-turn fallback below assumes long ≥ standard).
      minutes: Math.max(turn, r?.longMinutes && r.longMinutes > 0 ? r.longMinutes : 120),
    },
    allowReducedTurn: r?.allowReduced ?? true,
    showDuration: !!r?.showDuration,
    showEmailNotice: r?.showEmailNotice ?? true,
  };
}

/** How long a booking of this size holds the table, per the restaurant's rules. Pure. */
export function turnFor(partySize: number, cfg: ReservationConfig): number {
  return cfg.longTurn.enabled && partySize >= cfg.longTurn.fromParty ? cfg.longTurn.minutes : cfg.turn;
}

export type Closure = { id: string; dateFrom: string; dateTo: string; reason: string | null };

/** All closed-date ranges for a restaurant (owner settings + the public day picker). */
export async function getClosures(restaurantId: string): Promise<Closure[]> {
  return db
    .select({
      id: reservationClosures.id,
      dateFrom: reservationClosures.dateFrom,
      dateTo: reservationClosures.dateTo,
      reason: reservationClosures.reason,
    })
    .from(reservationClosures)
    .where(eq(reservationClosures.restaurantId, restaurantId))
    .orderBy(asc(reservationClosures.dateFrom));
}

/** True when the date falls inside any closed range (inclusive). Pure — for the form. */
export function isClosedOn(dateStr: string, closures: Closure[]): boolean {
  return closures.some((c) => dateStr >= c.dateFrom && dateStr <= c.dateTo);
}

/**
 * Add days to a "YYYY-MM-DD" date. Pure UTC arithmetic on the date parts, so a DST
 * change can never shift the result by a day.
 */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Why a date is outside the PUBLIC booking window — in the past, or further ahead
 * than "cu cât timp înainte" allows. Null when the date is inside the window.
 * Staff bypass this entirely: they may log a booking for any date.
 */
function outsideBookingWindow(dateStr: string, advanceDays: number): "past" | "too-far" | null {
  const today = nowInReservationTZ().date;
  if (dateStr < today) return "past";
  if (dateStr > addDaysISO(today, advanceDays)) return "too-far";
  return null;
}

/** Single-date closure check against the DB (server-side gate). */
async function isDateClosed(restaurantId: string, dateStr: string): Promise<boolean> {
  const [row] = await db
    .select({ id: reservationClosures.id })
    .from(reservationClosures)
    .where(
      and(
        eq(reservationClosures.restaurantId, restaurantId),
        lte(reservationClosures.dateFrom, dateStr),
        gte(reservationClosures.dateTo, dateStr),
      ),
    )
    .limit(1);
  return !!row;
}

export type ResTable = { id: string; label: string; seats: number; joinable: boolean; area: string | null };

/**
 * Active reservation tables, optionally filtered to an area. Online bookings only
 * ever see tables the owner left `bookableOnline` — the rest are held back for
 * walk-ins and phone bookings, and are returned for the "staff" channel.
 */
export async function getReservationTables(
  restaurantId: string,
  area?: Area,
  channel: BookingChannel = "online",
): Promise<ResTable[]> {
  const rows = await db
    .select({ id: reservationTables.id, label: reservationTables.label, seats: reservationTables.seats, joinable: reservationTables.joinable, area: reservationTables.area })
    .from(reservationTables)
    .where(
      and(
        eq(reservationTables.restaurantId, restaurantId),
        eq(reservationTables.isActive, true),
        channel === "online" ? eq(reservationTables.bookableOnline, true) : undefined,
      ),
    );
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

  // Physical correctness: a join may only combine tables from the SAME area — interior
  // and terasă can't be pushed together. When areas are ON the pool is already single-
  // area (a no-op); when areas are OFF but tables are area-tagged this still blocks a
  // cross-area join; with no areas at all (every area null) it's one partition = as before.
  const combineSameArea = (pool: ResTable[], cap: number): ResTable[][] => {
    const byArea = new Map<string, ResTable[]>();
    for (const t of pool) {
      const key = t.area ?? "__none__";
      const arr = byArea.get(key);
      if (arr) arr.push(t); else byArea.set(key, [t]);
    }
    const out: ResTable[][] = [];
    for (const arr of byArea.values()) {
      const combo = combine(arr, cap);
      if (combo) out.push(combo);
    }
    return out;
  };

  // 2. Within each group: free JOINABLE members, up to ALL of them (group size is the
  //    cap). "se poate uni" is the master switch — a non-joinable table is never
  //    combined, even if it's still listed in a group.
  for (const g of groups) {
    const members = g.tableIds.map((id) => freeById.get(id)).filter((t): t is ResTable => !!t && t.joinable);
    candidates.push(...combineSameArea(members, members.length));
  }

  // 3. Loose pool: free joinable tables in NO group, up to the global maxJoin.
  const grouped = new Set(groups.flatMap((g) => g.tableIds));
  const loose = free.filter((t) => t.joinable && !grouped.has(t.id));
  candidates.push(...combineSameArea(loose, maxJoin));

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

export type DayAvailability = {
  /** Start times bookable for this party's full duration. */
  slots: string[];
  /**
   * Start times that only fit at the STANDARD turn — i.e. the long-turn rule is the
   * sole reason they're not in `slots`. Offered with their real (shorter) end time.
   */
  reducedSlots: string[];
  /** Minutes a booking from `slots` would hold the table. */
  turnMinutes: number;
  /** Minutes a booking from `reducedSlots` would hold it (the standard turn). */
  reducedTurnMinutes: number;
};

/**
 * Live availability for a date + party size (+ optional area), using a SLIDING
 * WINDOW. Each pending/confirmed booking holds its seats across
 * [start, start + ITS OWN turn) — read from `reservations.turnMinutes`, falling back
 * to the restaurant's standard turn for rows booked before that column existed. The
 * candidate party's window length comes from the restaurant's rules (`turnFor`), so
 * a large party may need longer than an ordinary one.
 *
 * A candidate start T is bookable only if, at every 15-min tick within its window,
 * the seats consumed by overlapping bookings (in the requested area when given) plus
 * this party fit the tick's capacity.
 *
 * When the long-turn rule shortens a big party's options, a SECOND pass at the
 * standard turn finds the slots that were excluded only by the extra minutes (e.g. a
 * 90-minute gap between two bookings). Those come back as `reducedSlots` so the
 * booking isn't simply lost. Both passes reuse the same fetched rows — no extra query.
 */
export async function availabilityForDay(
  restaurantId: string,
  dateStr: string,
  partySize: number,
  area?: Area,
  // When re-checking availability for an EDIT, exclude that reservation so it
  // doesn't count its own (old) slot against itself.
  excludeReservationId?: string,
  channel: BookingChannel = "online",
): Promise<DayAvailability> {
  const cfg = await getReservationConfig(restaurantId);
  const fullTurn = turnFor(partySize, cfg);
  const empty: DayAvailability = { slots: [], reducedSlots: [], turnMinutes: fullTurn, reducedTurnMinutes: cfg.turn };

  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day && h.enabled);
  if (hours.length === 0) return empty;

  // Public booking is limited to [today, today + advanceDays] and to dates the owner
  // hasn't closed. Staff bypass both: they get an overridable warning at save time
  // instead, so a private event or an out-of-window booking can still be logged.
  if (channel === "online") {
    if (outsideBookingWindow(dateStr, cfg.advanceDays)) return empty;
    if (await isDateClosed(restaurantId, dateStr)) return empty;
  }

  // The shorter fallback only makes sense when the long turn is what's constraining
  // this party, and the owner left it enabled.
  const wantsReduced = cfg.allowReducedTurn && fullTurn > cfg.turn;

  // Existing bookings, each carrying the duration it was actually booked with.
  const booked = await db
    .select({
      time: reservations.time,
      partySize: reservations.partySize,
      area: reservations.area,
      turnMinutes: reservations.turnMinutes,
      assignedTableIds: reservations.assignedTableIds,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
        excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
      )
    );
  const endOf = (b: { time: string; turnMinutes: number | null }) => toMinutes(b.time) + (b.turnMinutes ?? cfg.turn);

  const finish = (slots: string[], reduced: string[]): DayAvailability => ({
    slots: dropPastSlotsForToday(dateStr, slots),
    reducedSlots: dropPastSlotsForToday(dateStr, reduced),
    turnMinutes: fullTurn,
    reducedTurnMinutes: cfg.turn,
  });

  // ── Tables mode: availability is decided by the table inventory, not a seat pool ──
  if (cfg.mode === "tables") {
    const tables = await getReservationTables(restaurantId, area, channel);
    if (tables.length === 0) return empty;
    const groups = await getReservationTableGroups(restaurantId);
    const windows = booked.map((b) => ({ start: toMinutes(b.time), end: endOf(b), tableIds: parseTableIds(b.assignedTableIds) }));
    const times = [...slotsWithCapacity(hours, area).keys()];

    // Bookings with no assigned tables (made in seats mode, or a staff force-override)
    // occupy nothing here — the mode-switch backfill is what attaches tables to those.
    const pass = (candidateTurn: number): string[] => {
      const out: string[] = [];
      for (const time of times) {
        const start = toMinutes(time);
        const end = start + candidateTurn;
        const busy = new Set<string>();
        for (const w of windows) {
          if (start < w.end && w.start < end) w.tableIds.forEach((id) => busy.add(id));
        }
        if (canSeat(partySize, tables.filter((t) => !busy.has(t.id)), cfg.maxJoin, groups)) out.push(time);
      }
      return out.sort();
    };

    const slots = pass(fullTurn);
    const reduced = wantsReduced ? pass(cfg.turn).filter((s) => !slots.includes(s)) : [];
    return finish(slots, reduced);
  }

  // ── Seats mode: a shared seat pool per window ──
  const caps = slotsWithCapacity(hours, area); // candidate start times → window capacity
  const windows = booked
    .filter((b) => !area || b.area === area)
    .map((b) => ({ start: toMinutes(b.time), end: endOf(b), size: b.partySize }));

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

  const pass = (candidateTurn: number): string[] => {
    const out: string[] = [];
    for (const [time] of caps) {
      const startMin = toMinutes(time);
      let fits = true;
      for (let t = startMin; t < startMin + candidateTurn; t += CAPACITY_TICK) {
        const cap = capacityAt(t);
        // Outside opening hours the seat pool is 0 → seating there still counts as the
        // party occupying the room; only enforce capacity where a window defines one.
        if (cap > 0 && takenAt(t) + partySize > cap) { fits = false; break; }
      }
      if (fits) out.push(time);
    }
    return out.sort();
  };

  const slots = pass(fullTurn);
  const reduced = wantsReduced ? pass(cfg.turn).filter((s) => !slots.includes(s)) : [];
  return finish(slots, reduced);
}

/** Just the full-duration start times — the long-standing shape used across the app. */
export async function availableSlotsForDay(
  restaurantId: string,
  dateStr: string,
  partySize: number,
  area?: Area,
  excludeReservationId?: string,
  channel: BookingChannel = "online",
): Promise<string[]> {
  return (await availabilityForDay(restaurantId, dateStr, partySize, area, excludeReservationId, channel)).slots;
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
 * Pick the actual table(s) to seat a party at a specific date/time, or null when
 * none is available — the booking-time counterpart of the tables-mode pass in
 * `availabilityForDay`. Verifies the time is a real slot, then computes the tables
 * free across this booking's own window. Existing bookings release their tables per
 * THEIR stored duration, so a big party's longer stay is honoured.
 *
 * `opts.turnMinutes` pins the window length (used when the guest accepted a
 * reduced-duration slot); otherwise it follows the restaurant's rules for this party.
 */
export async function assignTablesFor(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  area?: Area,
  excludeReservationId?: string,
  opts: { turnMinutes?: number; channel?: BookingChannel } = {},
): Promise<string[] | null> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day && h.enabled);
  if (hours.length === 0) return null;
  if (!slotsWithCapacity(hours, area).has(time)) return null;

  const cfg = await getReservationConfig(restaurantId);
  const turn = opts.turnMinutes ?? turnFor(partySize, cfg);
  const tables = await getReservationTables(restaurantId, area, opts.channel ?? "online");
  if (tables.length === 0) return null;
  const groups = await getReservationTableGroups(restaurantId);

  const booked = await db
    .select({ time: reservations.time, turnMinutes: reservations.turnMinutes, assignedTableIds: reservations.assignedTableIds })
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
    if (start < bs + (b.turnMinutes ?? cfg.turn) && bs < end) parseTableIds(b.assignedTableIds).forEach((id) => busy.add(id));
  }
  const free = tables.filter((t) => !busy.has(t.id));
  return canSeat(partySize, free, cfg.maxJoin, groups);
}

/**
 * Future live (pending/confirmed) bookings that are seated at a given table. Used
 * before deleting a table: removing it would leave those guests with no table while
 * silently freeing the slot for someone else (double-booking on arrival).
 */
export async function bookingsSeatedAtTable(restaurantId: string, tableId: string) {
  const today = nowInReservationTZ().date;
  const rows = await db
    .select({
      id: reservations.id,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      guestName: reservations.guestName,
      assignedTableIds: reservations.assignedTableIds,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        gte(reservations.date, today),
        inArray(reservations.status, ["pending", "confirmed"]),
        isNotNull(reservations.assignedTableIds),
      ),
    )
    .orderBy(asc(reservations.date), asc(reservations.time));
  return rows
    .filter((b) => parseTableIds(b.assignedTableIds).includes(tableId))
    .map(({ assignedTableIds: _drop, ...b }) => b);
}

/**
 * Future live bookings that fall inside a given hours interval. Used before DELETING
 * an interval: the bookings survive (staff still see them on the board), but the
 * owner should know they exist — „șterge” sits next to „pauză”, and only one of the
 * two is reversible. Matches on the interval's weekday and its [start, end] window,
 * so a split shift only reports the bookings in the shift being removed.
 */
export async function bookingsInHoursWindow(restaurantId: string, hourId: string) {
  const [h] = await db
    .select({ dayOfWeek: reservationHours.dayOfWeek, startTime: reservationHours.startTime, endTime: reservationHours.endTime })
    .from(reservationHours)
    .where(and(eq(reservationHours.id, hourId), eq(reservationHours.restaurantId, restaurantId)))
    .limit(1);
  if (!h) return null;

  const today = nowInReservationTZ().date;
  const rows = await db
    .select({
      id: reservations.id,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        gte(reservations.date, today),
        inArray(reservations.status, ["pending", "confirmed"]),
      ),
    )
    .orderBy(asc(reservations.date), asc(reservations.time));

  // The window end is the last SEATING time, so it's inclusive on both ends.
  return rows.filter(
    (b) =>
      new Date(`${b.date}T00:00:00`).getDay() === h.dayOfWeek &&
      b.time >= h.startTime &&
      b.time <= h.endTime,
  );
}

export type TableBackfillReport = {
  assigned: number;
  unassigned: { id: string; date: string; time: string; partySize: number; guestName: string }[];
};

/**
 * Attach real tables to FUTURE bookings that have none. Used when a restaurant switches
 * from "capacitate totală" to "mese individuale": those bookings were made without a
 * table, so they would occupy nothing and the slot could be oversold (e.g. 15 people
 * already booked, yet every table still looks free). Processes bookings chronologically
 * so the earliest gets first pick, persisting each assignment so the next one sees it.
 * NEVER changes a booking's date / time / party / status / duration — it only attaches
 * tables. Each booking is re-seated for the duration IT WAS BOOKED WITH, not one
 * recomputed from its party size: the restaurant's turn rules may have changed since,
 * and using the current rule would either free the table too early (a real overlap on
 * the floor) or reserve more than the booking actually holds.
 * Bookings that can't be seated are returned so the owner can handle them manually.
 */
export async function backfillTableAssignments(restaurantId: string): Promise<TableBackfillReport> {
  const today = nowInReservationTZ().date;
  const cfg = await getReservationConfig(restaurantId);
  const rows = await db
    .select({
      id: reservations.id,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      area: reservations.area,
      guestName: reservations.guestName,
      turnMinutes: reservations.turnMinutes,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        gte(reservations.date, today),
        inArray(reservations.status, ["pending", "confirmed"]),
        isNull(reservations.assignedTableIds),
      ),
    )
    .orderBy(asc(reservations.date), asc(reservations.time), asc(reservations.createdAt));

  const report: TableBackfillReport = { assigned: 0, unassigned: [] };
  for (const b of rows) {
    const area = (b.area as Area | null) ?? undefined;
    // Staff channel: an existing booking may be seated on a table held back from
    // online booking — better that than leaving a real guest with no table.
    // `turnMinutes` pins the window to what this booking actually holds.
    const ids = await assignTablesFor(restaurantId, b.date, b.time, b.partySize, area, b.id, {
      channel: "staff",
      turnMinutes: b.turnMinutes ?? cfg.turn,
    });
    if (ids) {
      await db
        .update(reservations)
        .set({ assignedTableIds: JSON.stringify(ids), updatedAt: new Date() })
        .where(eq(reservations.id, b.id));
      report.assigned++;
    } else {
      report.unassigned.push({ id: b.id, date: b.date, time: b.time, partySize: b.partySize, guestName: b.guestName });
    }
  }
  return report;
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
 * SEATS MODE: by how many seats a party would exceed the slot's capacity at the
 * tightest overlapping moment (0 = fits). Powers the staff override warning
 * ("depășește cu N locuri"). Excludes the reservation being edited.
 */
async function seatOverflowForSlot(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  area?: Area,
  excludeReservationId?: string,
  turnMinutes?: number,
): Promise<number> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day && h.enabled);
  if (hours.length === 0) return 0;
  const cfg = await getReservationConfig(restaurantId);
  const turn = turnMinutes ?? turnFor(partySize, cfg);

  const booked = await db
    .select({ time: reservations.time, partySize: reservations.partySize, area: reservations.area, turnMinutes: reservations.turnMinutes })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
        excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
      ),
    );
  const windows = booked
    .filter((b) => !area || b.area === area)
    .map((b) => ({ start: toMinutes(b.time), end: toMinutes(b.time) + (b.turnMinutes ?? cfg.turn), size: b.partySize }));
  const takenAt = (tick: number) => windows.reduce((sum, w) => (tick >= w.start && tick < w.end ? sum + w.size : sum), 0);
  const capacityAt = (tick: number) => {
    let cap = 0;
    for (const h of hours) {
      const s = toMinutes(h.startTime), e = toMinutes(h.endTime);
      if (tick >= s && tick <= e) cap = Math.max(cap, windowCapacity(h, area));
    }
    return cap;
  };

  const startMin = toMinutes(time);
  let worst = 0;
  for (let t = startMin; t < startMin + turn; t += CAPACITY_TICK) {
    const cap = capacityAt(t);
    if (cap > 0) worst = Math.max(worst, takenAt(t) + partySize - cap);
  }
  return Math.max(0, worst);
}

/** "…cu N locuri" phrasing for an overflow warning (the modal's override button
 * supplies the "save anyway" affordance, so the reason just states the fact). */
function overflowReason(over: number): string {
  return over > 0
    ? `Depășește capacitatea slotului cu ${over} ${over === 1 ? "loc" : "locuri"}.`
    : "Slotul este plin pentru acest număr de persoane.";
}

export type SlotSnapshot = {
  mode: CapacityMode;
  /** The date is marked closed for online bookings (staff may still book it). */
  closed: boolean;
  /** The time falls inside one of the day's active intervals. */
  inProgram: boolean;
  /** Seats defining the room at the tightest moment of this booking's window. */
  capacity: number;
  /** Seats held there by overlapping bookings. */
  occupied: number;
  remaining: number;
  /** By how many seats this party would exceed capacity (0 = it fits). */
  overflow: number;
  /** Whether the party can actually be seated — in tables mode a real table or join. */
  fits: boolean;
  /** How long this booking would hold the table, per the restaurant's rules. */
  turnMinutes: number;
  /** Tables mode only: free tables, and which ones this party would take. */
  freeTables?: number;
  wouldAssign?: string[];
};

/**
 * What the room looks like at one date/time for a party of this size — the live
 * preview behind the staff "add / edit reservation" modals, so the floor situation
 * is visible BEFORE saving rather than as a rejection afterwards. Read-only.
 *
 * In tables mode `capacity`/`occupied` count seats across the whole (staff-visible)
 * inventory, which is informative but not the deciding factor: `fits` is, because a
 * free seat on an occupied 2-top can't take a third person. The UI shows both.
 */
export async function slotCapacitySnapshot(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  area?: Area,
  excludeReservationId?: string,
): Promise<SlotSnapshot> {
  const cfg = await getReservationConfig(restaurantId);
  const turnMinutes = turnFor(partySize, cfg);
  const closed = await isDateClosed(restaurantId, dateStr);
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day && h.enabled);
  const inProgram = hours.length > 0 && slotsWithCapacity(hours, area).has(time);
  const base = { mode: cfg.mode, closed, inProgram, turnMinutes };
  if (hours.length === 0) {
    return { ...base, capacity: 0, occupied: 0, remaining: 0, overflow: 0, fits: false };
  }

  const booked = await db
    .select({
      time: reservations.time,
      partySize: reservations.partySize,
      area: reservations.area,
      turnMinutes: reservations.turnMinutes,
      assignedTableIds: reservations.assignedTableIds,
    })
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
  const end = start + turnMinutes;

  if (cfg.mode === "tables") {
    const tables = await getReservationTables(restaurantId, area, "staff");
    const capacity = tables.reduce((s, t) => s + t.seats, 0);
    const busy = new Set<string>();
    for (const b of booked) {
      const bs = toMinutes(b.time);
      if (start < bs + (b.turnMinutes ?? cfg.turn) && bs < end) parseTableIds(b.assignedTableIds).forEach((id) => busy.add(id));
    }
    const free = tables.filter((t) => !busy.has(t.id));
    const occupied = capacity - free.reduce((s, t) => s + t.seats, 0);
    const assign = canSeat(partySize, free, cfg.maxJoin, await getReservationTableGroups(restaurantId));
    const byId = new Map(tables.map((t) => [t.id, t.label]));
    return {
      ...base,
      capacity,
      occupied,
      remaining: capacity - occupied,
      overflow: Math.max(0, partySize - (capacity - occupied)),
      fits: !!assign,
      freeTables: free.length,
      wouldAssign: assign ? assign.map((id) => byId.get(id) ?? "?") : [],
    };
  }

  const windows = booked
    .filter((b) => !area || b.area === area)
    .map((b) => ({ start: toMinutes(b.time), end: toMinutes(b.time) + (b.turnMinutes ?? cfg.turn), size: b.partySize }));
  const takenAt = (tick: number) => windows.reduce((sum, w) => (tick >= w.start && tick < w.end ? sum + w.size : sum), 0);
  const capacityAt = (tick: number) => {
    let cap = 0;
    for (const h of hours) {
      const s = toMinutes(h.startTime);
      const e = toMinutes(h.endTime);
      if (tick >= s && tick <= e) cap = Math.max(cap, windowCapacity(h, area));
    }
    return cap;
  };

  // Report the tightest moment across the window — that's the one that decides.
  let capacity = 0;
  let occupied = 0;
  let overflow = 0;
  let tightest = Infinity;
  for (let t = start; t < end; t += CAPACITY_TICK) {
    const cap = capacityAt(t);
    if (cap <= 0) continue; // outside the program the seat pool isn't enforced
    const taken = takenAt(t);
    if (cap - taken < tightest) { tightest = cap - taken; capacity = cap; occupied = taken; }
    overflow = Math.max(overflow, taken + partySize - cap);
  }
  return {
    ...base,
    capacity,
    occupied,
    remaining: Math.max(0, capacity - occupied),
    overflow: Math.max(0, overflow),
    fits: overflow <= 0,
  };
}

/**
 * Why a public booking was refused, as a STABLE CODE plus the values needed to phrase
 * it. The client localises this; `reason` stays alongside as the Romanian fallback for
 * the API and for staff-facing callers. Codes exist so the booking form never has to
 * string-match a translated sentence.
 */
export type BookingRefusal =
  | { code: "party_size"; max: number }
  | { code: "area_required" }
  | { code: "date_past" }
  | { code: "date_too_far"; advanceDays: number }
  | { code: "date_closed" }
  | { code: "no_table" }
  | { code: "slot_taken" };

/** Kept as one loose shape (not a discriminated union) to match how every caller and
 *  test already reads this result; `refusal` is present exactly when `ok` is false. */
export type BookingValidation = {
  ok: boolean;
  reason?: string;
  refusal?: BookingRefusal;
  assignedTableIds?: string[];
  turnMinutes?: number;
};

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
  // `acceptReducedTurn`: the guest chose a slot the form flagged as shorter-than-usual.
  // Never trusted — the reduced fit is re-derived here before it's honoured.
  opts: { channel?: BookingChannel; acceptReducedTurn?: boolean } = {},
): Promise<BookingValidation> {
  const cap = await getMaxPartySize(restaurantId);
  if (partySize < 1 || partySize > cap) {
    return { ok: false, reason: `Numărul de persoane trebuie să fie între 1 și ${cap}.`, refusal: { code: "party_size", max: cap } };
  }
  // When areas are on, an area is required.
  if (await areasEnabled(restaurantId)) {
    if (area !== "inside" && area !== "outside") {
      return { ok: false, reason: "Alege zona (interior sau terasă).", refusal: { code: "area_required" } };
    }
  }

  const channel = opts.channel ?? "online";
  const cfg = await getReservationConfig(restaurantId);

  if (channel === "online") {
    // The date input's min/max is a convenience, not a gate — a direct POST bypasses
    // it, so the window is enforced here too. A past-dated booking would otherwise be
    // created and then never appear on the board (which only lists today onward).
    const outside = outsideBookingWindow(dateStr, cfg.advanceDays);
    if (outside === "past") {
      return { ok: false, reason: "Data a trecut. Alege o zi din viitor.", refusal: { code: "date_past" } };
    }
    if (outside === "too-far") {
      return { ok: false, reason: `Poți rezerva cu cel mult ${cfg.advanceDays} de zile înainte.`, refusal: { code: "date_too_far", advanceDays: cfg.advanceDays } };
    }
    if (await isDateClosed(restaurantId, dateStr)) {
      return { ok: false, reason: "Restaurantul nu primește rezervări în această zi. Alege altă dată.", refusal: { code: "date_closed" } };
    }
  }

  const fullTurn = turnFor(partySize, cfg);
  // A shorter stay is only ever an option when the long-turn rule is what's binding.
  const mayReduce = !!opts.acceptReducedTurn && cfg.allowReducedTurn && fullTurn > cfg.turn;

  // Tables mode: re-check by picking an actual free table (or join) at this exact
  // time, and return the assignment so the caller can persist it on the booking.
  if (cfg.mode === "tables") {
    const assigned = await assignTablesFor(restaurantId, dateStr, time, partySize, area, excludeReservationId, { turnMinutes: fullTurn, channel });
    if (assigned) return { ok: true, assignedTableIds: assigned, turnMinutes: fullTurn };

    if (mayReduce) {
      const short = await assignTablesFor(restaurantId, dateStr, time, partySize, area, excludeReservationId, { turnMinutes: cfg.turn, channel });
      if (short) return { ok: true, assignedTableIds: short, turnMinutes: cfg.turn };
    }
    return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă. Alege altă oră.", refusal: { code: "no_table" } };
  }

  const avail = await availabilityForDay(restaurantId, dateStr, partySize, area, excludeReservationId, channel);
  if (avail.slots.includes(time)) return { ok: true, turnMinutes: fullTurn };
  if (mayReduce && avail.reducedSlots.includes(time)) return { ok: true, turnMinutes: cfg.turn };
  return { ok: false, reason: "Ora selectată nu mai este disponibilă. Alege altă oră.", refusal: { code: "slot_taken" } };
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
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day && h.enabled);
  const caps = slotsWithCapacity(hours, area);
  if (!caps.has(input.time)) {
    return { ok: false, reason: "Ora nu este într-un interval de program." };
  }

  // A closed day is hidden from clients but staff may still log a booking on it —
  // they just have to confirm they meant to (private event, exceptional opening).
  if (!force && (await isDateClosed(restaurantId, input.date))) {
    return { ok: false, reason: "Această zi este marcată ca închisă pentru rezervări online.", overridable: true };
  }

  // Capacity check — unless forced. In tables mode this also picks the table(s).
  const cfg = await getReservationConfig(restaurantId);
  const fullTurn = turnFor(input.partySize, cfg);
  const mayReduce = cfg.allowReducedTurn && fullTurn > cfg.turn;
  let turnMinutes = fullTurn;
  let assignedTableIds: string[] | null = null;
  // Staff see the whole floor, including tables held back from online booking.
  const staff = { channel: "staff" as const };

  if (!force) {
    if (cfg.mode === "tables") {
      let assigned = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, undefined, { ...staff, turnMinutes: fullTurn });
      if (!assigned && mayReduce) {
        assigned = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, undefined, { ...staff, turnMinutes: cfg.turn });
        if (assigned) turnMinutes = cfg.turn;
      }
      if (!assigned) {
        return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă.", overridable: true };
      }
      assignedTableIds = assigned;
    } else {
      const avail = await availabilityForDay(restaurantId, input.date, input.partySize, area, undefined, "staff");
      if (!avail.slots.includes(input.time)) {
        if (mayReduce && avail.reducedSlots.includes(input.time)) {
          turnMinutes = cfg.turn;
        } else {
          const over = await seatOverflowForSlot(restaurantId, input.date, input.time, input.partySize, area, undefined, fullTurn);
          return { ok: false, reason: overflowReason(over), overridable: true };
        }
      }
    }
  } else if (cfg.mode === "tables") {
    // Forced booking: still try to attach a free table if one fits, but don't block.
    assignedTableIds = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, undefined, { ...staff, turnMinutes: fullTurn });
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
    turnMinutes,
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

  // Staff may exceed the website's max party size — only sanity-bound (≥1). The slot
  // capacity is still checked below, but as an overridable warning, not a hard block.
  if (input.partySize < 1) return { ok: false, reason: "Număr de persoane invalid." };

  // No moving into the past (Bucharest-local day).
  if (input.date < nowInReservationTZ().date) return { ok: false, reason: "Data trebuie să fie în viitor." };

  const area = (res.area as Area | null) ?? undefined;

  // The new time must fall within the day's program.
  const day = new Date(`${input.date}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day && h.enabled);
  if (!slotsWithCapacity(hours, area).has(input.time)) {
    return { ok: false, reason: "Ora nu este într-un interval de program." };
  }

  // A closed day is overridable here too — same reasoning as a manual booking.
  if (!force && (await isDateClosed(restaurantId, input.date))) {
    return { ok: false, reason: "Această zi este marcată ca închisă pentru rezervări online.", overridable: true };
  }

  // Capacity check EXCLUDING this reservation — unless forced. Tables mode re-picks
  // table(s). The duration is recomputed from the NEW party size, so growing a
  // booking past the large-party threshold correctly extends how long it holds the table.
  const cfg = await getReservationConfig(restaurantId);
  const fullTurn = turnFor(input.partySize, cfg);
  const mayReduce = cfg.allowReducedTurn && fullTurn > cfg.turn;
  let turnMinutes = fullTurn;
  let assignedTableIds: string[] | null = null;
  const staff = { channel: "staff" as const };

  if (!force) {
    if (cfg.mode === "tables") {
      let assigned = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, reservationId, { ...staff, turnMinutes: fullTurn });
      if (!assigned && mayReduce) {
        assigned = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, reservationId, { ...staff, turnMinutes: cfg.turn });
        if (assigned) turnMinutes = cfg.turn;
      }
      if (!assigned) {
        return { ok: false, reason: "Nu mai avem o masă liberă pentru acest număr de persoane la ora aleasă.", overridable: true };
      }
      assignedTableIds = assigned;
    } else {
      const avail = await availabilityForDay(restaurantId, input.date, input.partySize, area, reservationId, "staff");
      if (!avail.slots.includes(input.time)) {
        if (mayReduce && avail.reducedSlots.includes(input.time)) {
          turnMinutes = cfg.turn;
        } else {
          const over = await seatOverflowForSlot(restaurantId, input.date, input.time, input.partySize, area, reservationId, fullTurn);
          return { ok: false, reason: overflowReason(over), overridable: true };
        }
      }
    }
  } else if (cfg.mode === "tables") {
    assignedTableIds = await assignTablesFor(restaurantId, input.date, input.time, input.partySize, area, reservationId, { ...staff, turnMinutes: fullTurn });
  }

  await db
    .update(reservations)
    .set({
      date: input.date,
      time: input.time,
      partySize: input.partySize,
      assignedTableIds: cfg.mode === "tables" ? (assignedTableIds ? JSON.stringify(assignedTableIds) : null) : null,
      turnMinutes,
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
