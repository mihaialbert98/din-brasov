/**
 * „Plan de sală” — who sits where.
 *
 * A restaurant on „Capacitate totală” books against one seat pool, which answers
 * "do we have room?" but not "which tables do they get?". This lets the owner draw the
 * room — tables named however they like, grouped into their own sections — and lets
 * whoever works the board pin a booking to one or more of them. A pinned table is held
 * for exactly that booking's interval, so a second booking overlapping it can't take the
 * same table, and the moment the first one ends (or is cancelled) it's free again.
 *
 * ENTIRELY OPTIONAL, at every level: a restaurant may define no floor plan at all, or
 * define one and never use it, or pin some bookings and not others. Nothing here refuses,
 * blocks or flags a booking for having no table — an unassigned booking is a completely
 * normal booking, and the client never sees any of this.
 *
 * Deliberately a SEPARATE module from lib/reservations.ts: public availability must not be
 * able to change as a side effect of this feature. Nothing here is called from
 * availabilityForDay / validateBooking / assignTablesFor; the engine only calls in at the
 * two points where a booking is written (create / update), and only to touch its own column.
 */
import { db } from "@/lib/db";
import { floorSections, floorTables, reservations, restaurants } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import {
  getReservationConfig,
  nowInReservationTZ,
  parseTableIds,
  toHHMM,
  toMinutes,
} from "@/lib/reservation-core";
import { claimTables } from "@/lib/table-claim";

export type FloorSectionRow = { id: string; label: string };
export type FloorTableRow = { id: string; label: string; sectionId: string | null; isActive: boolean };

/** A booking that currently holds a table, described for the person looking at the picker. */
export type FloorTableHolder = {
  reservationId: string;
  guestName: string;
  /** The window it holds — "19:00" … "20:30", in the venue's wall clock. */
  from: string;
  to: string;
};

/** One table as the picker sees it: free, or held by a booking that overlaps. */
export type FloorTableStatus = FloorTableRow & { busy: FloorTableHolder | null };

export type FloorPlanSnapshot = {
  sections: FloorSectionRow[];
  tables: FloorTableStatus[];
};

/** Sections of the room, oldest first (the order the owner created them in). */
export async function getFloorSections(restaurantId: string): Promise<FloorSectionRow[]> {
  return db
    .select({ id: floorSections.id, label: floorSections.label })
    .from(floorSections)
    .where(eq(floorSections.restaurantId, restaurantId))
    .orderBy(asc(floorSections.createdAt));
}

/**
 * Resolve a section id to one this restaurant actually owns, or null.
 *
 * Guards the cross-tenant case: a table must never end up filed under another
 * restaurant's section, whether through a crafted request or a stale id. Returning null
 * (→ „Fără secțiune”) rather than throwing keeps the table usable either way.
 */
export async function resolveOwnSection(restaurantId: string, sectionId: string | null | undefined): Promise<string | null> {
  if (!sectionId) return null;
  const [s] = await db
    .select({ id: floorSections.id })
    .from(floorSections)
    .where(and(eq(floorSections.id, sectionId), eq(floorSections.restaurantId, restaurantId)))
    .limit(1);
  return s?.id ?? null;
}

/** Every table in the room, active or not. */
export async function getFloorTables(restaurantId: string): Promise<FloorTableRow[]> {
  return db
    .select({
      id: floorTables.id,
      label: floorTables.label,
      sectionId: floorTables.sectionId,
      isActive: floorTables.isActive,
    })
    .from(floorTables)
    .where(eq(floorTables.restaurantId, restaurantId))
    .orderBy(asc(floorTables.createdAt));
}

/**
 * Whether the board should offer table assignment at all: „Capacitate totală” AND at
 * least one usable table. False means the feature is invisible and the board behaves
 * exactly as it did before this existed.
 */
export async function floorPlanEnabled(restaurantId: string): Promise<boolean> {
  const [r] = await db
    .select({ mode: restaurants.reservationCapacityMode })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (r?.mode === "tables") return false; // that mode assigns real tables on its own
  const tables = await getFloorTables(restaurantId);
  return tables.some((t) => t.isActive);
}

type LiveBooking = { id: string; time: string; turnMinutes: number | null; guestName: string; floorTableIds: string | null };

/** Live (pending|confirmed) bookings on one date. Cancelled/declined hold nothing. */
async function liveBookingsOn(restaurantId: string, dateStr: string, excludeReservationId?: string): Promise<LiveBooking[]> {
  return db
    .select({
      id: reservations.id,
      time: reservations.time,
      turnMinutes: reservations.turnMinutes,
      guestName: reservations.guestName,
      floorTableIds: reservations.floorTableIds,
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
}

/**
 * Which tables an overlapping booking is holding, and who's holding them.
 *
 * THE INVARIANT this whole feature rests on: a booking holds its tables across
 * [time, time + ITS OWN stored turnMinutes). The duration is read from the row, never
 * recomputed from the party size — the restaurant's turn rules may have changed since,
 * and recomputing would either free a table while people are still sitting at it or hold
 * one longer than the booking actually runs. (This is exactly the bug that
 * backfillTableAssignments shipped with in v0.26.) `standardTurn` only fills in for rows
 * booked before turnMinutes existed.
 *
 * Because the duration is per booking, the long-turn and reduced-turn features work here
 * for free: a party stored at 120 minutes holds its table 30 minutes longer than one
 * stored at 90, whatever the current settings say.
 */
function holdersInWindow(
  bookings: LiveBooking[],
  start: number,
  end: number,
  standardTurn: number,
): Map<string, FloorTableHolder> {
  const held = new Map<string, FloorTableHolder>();
  for (const b of bookings) {
    const bStart = toMinutes(b.time);
    const bEnd = bStart + (b.turnMinutes ?? standardTurn);
    // Half-open overlap: back-to-back bookings (one ends exactly when the next starts)
    // do NOT conflict — the table turns over.
    if (!(start < bEnd && bStart < end)) continue;
    for (const id of parseTableIds(b.floorTableIds)) {
      if (!held.has(id)) {
        held.set(id, { reservationId: b.id, guestName: b.guestName, from: b.time, to: toHHMM(bEnd) });
      }
    }
  }
  return held;
}

/** The minute window a booking starting at `time` and running `turnMinutes` occupies. */
function windowFor(time: string, turnMinutes: number): { start: number; end: number } {
  const start = toMinutes(time);
  return { start, end: start + turnMinutes };
}

/**
 * The picker's data: the room, plus who (if anyone) holds each table across the window a
 * booking at this date/time would occupy. `turnMinutes` pins the window when the caller
 * already knows it (an existing booking's stored duration); otherwise it follows the
 * restaurant's rules for this party size.
 */
export async function floorTableStatus(
  restaurantId: string,
  dateStr: string,
  time: string,
  opts: { partySize?: number; turnMinutes?: number; exclude?: string } = {},
): Promise<FloorPlanSnapshot> {
  const cfg = await getReservationConfig(restaurantId);
  const turn =
    opts.turnMinutes ??
    (cfg.longTurn.enabled && (opts.partySize ?? 0) >= cfg.longTurn.fromParty ? cfg.longTurn.minutes : cfg.turn);

  const [sections, tables, bookings] = await Promise.all([
    getFloorSections(restaurantId),
    getFloorTables(restaurantId),
    liveBookingsOn(restaurantId, dateStr, opts.exclude),
  ]);

  const { start, end } = windowFor(time, turn);
  const held = holdersInWindow(bookings, start, end, cfg.turn);

  return { sections, tables: tables.map((t) => ({ ...t, busy: held.get(t.id) ?? null })) };
}

export type FloorConflict = { tableId: string; label: string; guestName: string; from: string; to: string };

export type FloorValidation =
  | { ok: true; ids: string[] }
  | { ok: false; reason: string; conflicts: FloorConflict[] };

/**
 * Can this booking hold these tables? An empty list is always valid — that is how staff
 * un-assign, and how the overwhelming majority of bookings stay. Rejects ids that aren't
 * this restaurant's (cross-tenant), tables taken out of use, and tables an overlapping
 * booking already holds. There is no override: two bookings holding one table is never
 * something the owner meant.
 */
export async function validateFloorTables(
  restaurantId: string,
  dateStr: string,
  time: string,
  /** The booking's own duration; null falls back to the restaurant's standard turn. */
  turnMinutes: number | null,
  ids: string[],
  excludeReservationId?: string,
): Promise<FloorValidation> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (wanted.length === 0) return { ok: true, ids: [] };

  const tables = await getFloorTables(restaurantId);
  const byId = new Map(tables.map((t) => [t.id, t]));

  // Scoped to this restaurant: an id from another restaurant's floor plan simply doesn't
  // exist here, so it can never be pinned onto this booking.
  const unknown = wanted.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { ok: false, reason: "Masă inexistentă.", conflicts: [] };

  const inactive = wanted.filter((id) => !byId.get(id)!.isActive);
  if (inactive.length > 0) {
    const names = inactive.map((id) => byId.get(id)!.label).join(", ");
    return { ok: false, reason: `${inactive.length === 1 ? "Masa" : "Mesele"} ${names} ${inactive.length === 1 ? "este scoasă" : "sunt scoase"} din uz.`, conflicts: [] };
  }

  const [bookings, cfg] = await Promise.all([
    liveBookingsOn(restaurantId, dateStr, excludeReservationId),
    getReservationConfig(restaurantId),
  ]);
  const { start, end } = windowFor(time, turnMinutes ?? cfg.turn);
  const held = holdersInWindow(bookings, start, end, cfg.turn);

  const conflicts: FloorConflict[] = [];
  for (const id of wanted) {
    const h = held.get(id);
    if (h) conflicts.push({ tableId: id, label: byId.get(id)!.label, guestName: h.guestName, from: h.from, to: h.to });
  }
  if (conflicts.length > 0) {
    const first = conflicts[0];
    return {
      ok: false,
      reason:
        conflicts.length === 1
          ? `Masa ${first.label} este ocupată în acest interval (${first.guestName}, ${first.from}–${first.to}).`
          : `${conflicts.length} mese sunt ocupate în acest interval: ${conflicts.map((c) => `${c.label} (${c.guestName})`).join(", ")}.`,
      conflicts,
    };
  }
  return { ok: true, ids: wanted };
}

/**
 * Set (or clear) a booking's tables. Reads the booking's OWN stored duration so the
 * window checked is the one it actually occupies. Passing an empty list clears the
 * assignment and is a success, not an error.
 */
export async function setFloorTables(
  restaurantId: string,
  reservationId: string,
  ids: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; reason: string; conflicts: FloorConflict[]; status: number }> {
  const [res] = await db
    .select({
      date: reservations.date,
      time: reservations.time,
      turnMinutes: reservations.turnMinutes,
      status: reservations.status,
    })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res) return { ok: false, reason: "Rezervare negăsită.", conflicts: [], status: 404 };
  if (res.status !== "pending" && res.status !== "confirmed") {
    return { ok: false, reason: "Rezervarea nu mai este activă.", conflicts: [], status: 409 };
  }

  // Cheap pre-check first: it produces the human message (who holds the table, until when)
  // and catches the non-race refusals — unknown id, another restaurant's table, out of use.
  const v = await validateFloorTables(restaurantId, res.date, res.time, res.turnMinutes, ids, reservationId);
  if (!v.ok) return { ...v, status: 409 };

  // Clearing can't collide with anyone, so it takes the plain path.
  if (v.ids.length === 0) {
    await db
      .update(reservations)
      .set({ floorTableIds: null, updatedAt: new Date() })
      .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)));
    return { ok: true, ids: [] };
  }

  const cfg = await getReservationConfig(restaurantId);
  const won = await claimTables("floor_table_ids", restaurantId, reservationId, res.date, res.time, res.turnMinutes ?? cfg.turn, cfg.turn, v.ids);
  if (!won) {
    // Beaten to it between the check and the write. Re-read so the message names whoever
    // actually holds it now, rather than saying something vague about a collision.
    const again = await validateFloorTables(restaurantId, res.date, res.time, res.turnMinutes, ids, reservationId);
    if (!again.ok) return { ...again, status: 409 };
    return { ok: false, reason: "Masa tocmai a fost atribuită altei rezervări. Încearcă din nou.", conflicts: [], status: 409 };
  }
  return { ok: true, ids: v.ids };
}

/**
 * Keep a booking's tables honest after its date / time / party size changed.
 *
 * `explicitIds` = staff picked tables in the edit dialog; those win (and are validated).
 * Otherwise the existing assignment is re-checked against the NEW window: still free →
 * kept; now clashing with another booking → CLEARED, and the labels are returned so the
 * board can say so. Clearing rather than refusing is deliberate — the edit is about the
 * guest, and a seating note must never be able to block moving their booking.
 *
 * Returns the labels it dropped, so the caller only speaks up when staff actually lose a
 * choice they had made. A booking that never had tables produces silence.
 */
export async function reconcileFloorTables(
  restaurantId: string,
  reservationId: string,
  dateStr: string,
  time: string,
  turnMinutes: number,
  explicitIds?: string[],
): Promise<{ cleared: string[] }> {
  const [res] = await db
    .select({ floorTableIds: reservations.floorTableIds })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  const current = parseTableIds(res?.floorTableIds ?? null);
  const wanted = explicitIds ?? current;
  if (wanted.length === 0) {
    // Nothing to keep. Only write when there's something to erase.
    if (current.length > 0 && explicitIds) {
      await db.update(reservations).set({ floorTableIds: null }).where(eq(reservations.id, reservationId));
    }
    return { cleared: [] };
  }

  // Same atomic claim as setFloorTables — an edit and an assignment can collide too.
  const v = await validateFloorTables(restaurantId, dateStr, time, turnMinutes, wanted, reservationId);
  const cfgR = await getReservationConfig(restaurantId);
  if (v.ok && (await claimTables("floor_table_ids", restaurantId, reservationId, dateStr, time, turnMinutes, cfgR.turn, v.ids))) {
    return { cleared: [] };
  }

  await db.update(reservations).set({ floorTableIds: null }).where(eq(reservations.id, reservationId));
  const tables = await getFloorTables(restaurantId);
  const labelById = new Map(tables.map((t) => [t.id, t.label]));
  return { cleared: wanted.map((id) => labelById.get(id) ?? "?") };
}

/**
 * Future live bookings pinned to a table. Used before deleting one: the booking itself is
 * unaffected (it never depended on the table), but staff lose the note of where those
 * guests were going to sit, so they should be told which ones.
 */
export async function bookingsAtFloorTable(restaurantId: string, tableId: string) {
  const today = nowInReservationTZ().date;
  const rows = await db
    .select({
      id: reservations.id,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      guestName: reservations.guestName,
      floorTableIds: reservations.floorTableIds,
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
  return rows
    .filter((b) => parseTableIds(b.floorTableIds).includes(tableId))
    .map(({ floorTableIds: _drop, ...b }) => b);
}

/**
 * Strip a table id out of every booking that holds it, keeping the rest of each
 * assignment. Run just before the table row is deleted, so no booking is left pointing at
 * something that no longer exists.
 */
export async function detachFloorTable(restaurantId: string, tableId: string): Promise<number> {
  const affected = await bookingsAtFloorTable(restaurantId, tableId);
  if (affected.length === 0) return 0;

  const rows = await db
    .select({ id: reservations.id, floorTableIds: reservations.floorTableIds })
    .from(reservations)
    .where(inArray(reservations.id, affected.map((b) => b.id)));

  for (const r of rows) {
    const rest = parseTableIds(r.floorTableIds).filter((id) => id !== tableId);
    await db
      .update(reservations)
      .set({ floorTableIds: rest.length ? JSON.stringify(rest) : null })
      .where(eq(reservations.id, r.id));
  }
  return affected.length;
}
