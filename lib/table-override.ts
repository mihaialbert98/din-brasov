/**
 * „Schimbă masa” — the owner overriding which table a booking sits at, in „Mese
 * individuale”.
 *
 * That mode picks a table automatically: the smallest free one that seats the party, or a
 * legal join. It's right most of the time and wrong sometimes — the owner knows this party
 * wants the window table, or wants the big table kept clear for a group arriving later.
 * So they can change it by hand, and their choice sticks.
 *
 * DIFFERENT FROM „Plan de sală”, deliberately. That is a seats-mode drawing of the room
 * where a table's size is irrelevant and any free table may be pinned to any booking. Here
 * the table's seat count is the whole basis of the mode, so a choice must still SEAT THE
 * PARTY and still be FREE — both are hard blocks. Neither system is ever visible in the
 * other's mode, and they use separate columns.
 *
 * A manual choice is remembered (`reservations.assignedTablesManual`) so a later edit does
 * not silently undo it. It is kept for as long as it still works; when a change makes it
 * impossible — the party grew past the table, or the new time collides — the engine takes
 * the booking back over and the board says so, rather than leaving people at a table that
 * can't hold them.
 */
import { db } from "@/lib/db";
import { reservations, reservationTables } from "@/lib/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getReservationConfig, parseTableIds, toHHMM, toMinutes } from "@/lib/reservation-core";
import { claimTables } from "@/lib/table-claim";

/** A table as the „Schimbă masa” picker sees it. */
export type TableOption = {
  id: string;
  label: string;
  seats: number;
  area: string | null;
  joinable: boolean;
  /** Held back from the public form (walk-ins) — staff may still use it, so it's shown. */
  bookableOnline: boolean;
  /** Big enough for this party on its own. Smaller tables can still be combined. */
  fits: boolean;
  /** Non-null when an overlapping booking already has it. */
  busy: { reservationId: string; guestName: string; from: string; to: string } | null;
};

export type TableOptions = {
  tables: TableOption[];
  /** What the booking holds right now, so the picker opens on the current choice. */
  current: string[];
  /** Whether that choice was made by hand or by the engine. */
  manual: boolean;
  partySize: number;
};

/**
 * Every table staff may use, active or not held back — the whole floor, since this is a
 * staff-only surface. Read here rather than through getReservationTables() so this module
 * never has to import lib/reservations.ts, which imports it back.
 */
async function allStaffTables(restaurantId: string) {
  return db
    .select({
      id: reservationTables.id,
      label: reservationTables.label,
      seats: reservationTables.seats,
      area: reservationTables.area,
      joinable: reservationTables.joinable,
      bookableOnline: reservationTables.bookableOnline,
    })
    .from(reservationTables)
    .where(and(eq(reservationTables.restaurantId, restaurantId), eq(reservationTables.isActive, true)));
}

/** Live bookings on a date, each with the tables and duration it actually holds. */
async function liveBookingsOn(restaurantId: string, dateStr: string, exclude?: string) {
  return db
    .select({
      id: reservations.id,
      time: reservations.time,
      turnMinutes: reservations.turnMinutes,
      guestName: reservations.guestName,
      assignedTableIds: reservations.assignedTableIds,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
        exclude ? ne(reservations.id, exclude) : undefined,
      ),
    );
}

/** Who holds which table across [start, end) — per each booking's OWN stored duration. */
function holdersInWindow(
  bookings: Awaited<ReturnType<typeof liveBookingsOn>>,
  start: number,
  end: number,
  standardTurn: number,
) {
  const held = new Map<string, { reservationId: string; guestName: string; from: string; to: string }>();
  for (const b of bookings) {
    const bStart = toMinutes(b.time);
    const bEnd = bStart + (b.turnMinutes ?? standardTurn);
    if (!(start < bEnd && bStart < end)) continue; // half-open: back-to-back is fine
    for (const id of parseTableIds(b.assignedTableIds)) {
      if (!held.has(id)) held.set(id, { reservationId: b.id, guestName: b.guestName, from: b.time, to: toHHMM(bEnd) });
    }
  }
  return held;
}

/** The picker's data for one existing booking. */
export async function tableOptionsFor(restaurantId: string, reservationId: string): Promise<TableOptions | null> {
  const [res] = await db
    .select({
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      turnMinutes: reservations.turnMinutes,
      assignedTableIds: reservations.assignedTableIds,
      manual: reservations.assignedTablesManual,
    })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res) return null;

  const cfg = await getReservationConfig(restaurantId);
  const turn = res.turnMinutes ?? cfg.turn;
  const start = toMinutes(res.time);
  const [tables, bookings] = await Promise.all([
    allStaffTables(restaurantId),
    liveBookingsOn(restaurantId, res.date, reservationId),
  ]);
  const held = holdersInWindow(bookings, start, start + turn, cfg.turn);

  return {
    tables: tables.map((t) => ({ ...t, fits: t.seats >= res.partySize, busy: held.get(t.id) ?? null })),
    current: parseTableIds(res.assignedTableIds),
    manual: res.manual,
    partySize: res.partySize,
  };
}

export type OverrideCheck = { ok: true; ids: string[] } | { ok: false; reason: string };

/**
 * Is this a table (or combination) the booking may actually sit at?
 *
 * Three hard blocks, no overrides:
 *   • it has to exist and be in use at this restaurant;
 *   • the seats have to add up to the party — the point of „Mese individuale”;
 *   • nothing overlapping may already hold it.
 *
 * Combining tables from DIFFERENT areas is refused too: interior and terasă can't be
 * pushed together, whatever the seat count says. Beyond that a manual combination is not
 * held to the automatic chooser's rules („se poate uni”, max join) — those exist to stop
 * the ENGINE guessing at joins; an owner selecting two tables by hand is stating that
 * these two, in particular, go together.
 */
export async function validateTableOverride(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  turnMinutes: number | null,
  ids: string[],
  excludeReservationId?: string,
): Promise<OverrideCheck> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (wanted.length === 0) return { ok: false, reason: "Alege cel puțin o masă." };

  const tables = await allStaffTables(restaurantId);
  const byId = new Map(tables.map((t) => [t.id, t]));
  const chosen = wanted.map((id) => byId.get(id));
  if (chosen.some((t) => !t)) {
    return { ok: false, reason: "Masă inexistentă sau dezactivată." };
  }
  const picked = chosen as NonNullable<(typeof chosen)[number]>[];

  const areas = new Set(picked.map((t) => t.area ?? "__none__"));
  if (areas.size > 1) {
    return { ok: false, reason: "Nu poți uni mese din zone diferite (interior și terasă)." };
  }

  const total = picked.reduce((s, t) => s + t.seats, 0);
  if (total < partySize) {
    const names = picked.map((t) => t.label).join(" + ");
    return {
      ok: false,
      reason: picked.length === 1
        ? `La ${names} încap ${total} ${total === 1 ? "persoană" : "persoane"}, iar rezervarea are ${partySize}.`
        : `La ${names} încap ${total} persoane împreună, iar rezervarea are ${partySize}.`,
    };
  }

  const cfg = await getReservationConfig(restaurantId);
  const start = toMinutes(time);
  const bookings = await liveBookingsOn(restaurantId, dateStr, excludeReservationId);
  const held = holdersInWindow(bookings, start, start + (turnMinutes ?? cfg.turn), cfg.turn);
  const taken = picked.filter((t) => held.has(t.id));
  if (taken.length > 0) {
    const first = held.get(taken[0].id)!;
    return {
      ok: false,
      reason: taken.length === 1
        ? `Masa ${taken[0].label} este ocupată în acest interval (${first.guestName}, ${first.from}–${first.to}).`
        : `${taken.map((t) => t.label).join(", ")} sunt ocupate în acest interval.`,
    };
  }

  return { ok: true, ids: wanted };
}

/**
 * Move a booking onto the chosen table(s). Same atomic claim as the floor plan, so two
 * staff overriding onto one table at the same moment cannot both win.
 */
export async function setReservationTables(
  restaurantId: string,
  reservationId: string,
  ids: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; reason: string; status: number }> {
  const [res] = await db
    .select({
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      turnMinutes: reservations.turnMinutes,
      status: reservations.status,
    })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res) return { ok: false, reason: "Rezervare negăsită.", status: 404 };
  if (res.status !== "pending" && res.status !== "confirmed") {
    return { ok: false, reason: "Rezervarea nu mai este activă.", status: 409 };
  }

  const v = await validateTableOverride(restaurantId, res.date, res.time, res.partySize, res.turnMinutes, ids, reservationId);
  if (!v.ok) return { ...v, status: 409 };

  const cfg = await getReservationConfig(restaurantId);
  const won = await claimTables(
    "assigned_table_ids", restaurantId, reservationId, res.date, res.time,
    res.turnMinutes ?? cfg.turn, cfg.turn, v.ids,
  );
  if (!won) {
    const again = await validateTableOverride(restaurantId, res.date, res.time, res.partySize, res.turnMinutes, ids, reservationId);
    if (!again.ok) return { ...again, status: 409 };
    return { ok: false, reason: "Masa tocmai a fost ocupată de altă rezervare. Încearcă din nou.", status: 409 };
  }
  return { ok: true, ids: v.ids };
}

/**
 * Hand a booking back to the automatic chooser („Alege automat”), so it behaves like every
 * other booking again. Clearing the flag is enough — the caller re-runs the assignment.
 */
export async function clearManualFlag(restaurantId: string, reservationId: string): Promise<void> {
  await db
    .update(reservations)
    .set({ assignedTablesManual: false })
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)));
}

/**
 * On edit: may this booking KEEP the tables staff chose for it?
 *
 * Called with the booking's NEW date / time / party. True → the choice still seats the
 * party and is still free, so the engine must not touch it. False → it stopped working
 * (party outgrew the table, or the new time collides), and the caller falls back to
 * automatic assignment and tells staff the table changed.
 */
export async function manualChoiceStillWorks(
  restaurantId: string,
  reservationId: string,
  dateStr: string,
  time: string,
  partySize: number,
  turnMinutes: number,
): Promise<{ keep: false } | { keep: true; ids: string[] }> {
  const [res] = await db
    .select({ manual: reservations.assignedTablesManual, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res?.manual) return { keep: false };

  const ids = parseTableIds(res.assignedTableIds);
  if (ids.length === 0) return { keep: false };

  const v = await validateTableOverride(restaurantId, dateStr, time, partySize, turnMinutes, ids, reservationId);
  return v.ok ? { keep: true, ids: v.ids } : { keep: false };
}

/** Labels for a set of table ids, for messages like „masa a fost schimbată”. */
export async function tableLabels(restaurantId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: reservationTables.id, label: reservationTables.label })
    .from(reservationTables)
    .where(eq(reservationTables.restaurantId, restaurantId));
  const byId = new Map(rows.map((r) => [r.id, r.label]));
  return ids.map((id) => byId.get(id) ?? "?");
}
