/**
 * „Plan de sală” — hand-assigned tables on „Capacitate totală” restaurants.
 *
 * The whole point of the feature is one rule: a table pinned to a booking is held for
 * exactly that booking's interval, and nobody else can have it in that interval. Everything
 * below exists to prove that rule survives the things that have broken table logic before —
 * the long turn, the reduced turn, a settings change after the fact, an edit that moves the
 * booking, a deleted table.
 *
 * Proves:
 *   - an overlapping booking is refused the table, and the refusal names who holds it
 *   - back-to-back bookings share a table (the turn is half-open, not inclusive)
 *   - the LONG turn extends the hold; the REDUCED turn shortens it — per booking
 *   - changing the restaurant's turn afterwards moves NO existing booking's release time
 *   - cancelling / declining frees the tables immediately
 *   - an edit into a clashing window CLEARS the assignment and reports it; a clean move keeps it
 *   - deleting a table detaches it and leaves the bookings intact; deactivating does not
 *   - deleting a section keeps its tables (and their assignments) — „Fără secțiune”
 *   - INVARIANT SWEEP: no two live bookings sharing a table ever overlap
 *   - public availability is byte-identical with and without a floor plan
 *   - assignment is OPTIONAL end to end, and cross-tenant ids are refused
 *
 * Throwaway restaurants (slug flrpl-*), self-cleaning. No email is sent: every booking is
 * created without a guest email, and status changes go through the DB, not the notify path.
 *
 * Run: pnpm tsx scripts/test-floor-plan.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, floorSections, floorTables, reservationTables } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  availabilityForDay,
  createManualReservation,
  updateReservation,
  listUpcomingReservations,
  backfillTableAssignments,
  toMinutes,
} from "../lib/reservations";
import {
  floorTableStatus,
  validateFloorTables,
  setFloorTables,
  bookingsAtFloorTable,
  detachFloorTable,
  floorPlanEnabled,
  getFloorTables,
} from "../lib/floor-plan";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "flrpl-";

/** A near-future date on a given weekday, so the booking window is never the issue. */
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (new Date(`${iso}T00:00:00`).getDay() === dow) return iso;
  }
  throw new Error("no date found");
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(floorTables).where(inArray(floorTables.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(floorSections).where(inArray(floorSections.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function makeRestaurant(key: string, opts: { turn?: number; longTurn?: { from: number; minutes: number }; allowReduced?: boolean; seats?: number } = {}) {
  const slug = `${P}${key}`;
  const [pl] = await db.insert(places).values({
    name: `Test ${key}`, description: "test", slug, category: "Restaurant", address: "Brașov", status: "published",
  }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `Test ${key}`, slug, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "auto",
    reservationCapacityMode: "seats",
    reservationTurnMinutes: opts.turn ?? 90,
    reservationMaxPartySize: 20,
    reservationAdvanceDays: 60,
    reservationLongTurnEnabled: !!opts.longTurn,
    reservationLongTurnFromParty: opts.longTurn?.from ?? 6,
    reservationLongTurnMinutes: opts.longTurn?.minutes ?? 120,
    reservationAllowReducedTurn: opts.allowReduced ?? true,
  }).returning({ id: restaurants.id });
  // Open every day, wide window, and by default so many seats that capacity can never be
  // the reason something is refused — the floor plan must be the only constraint. Tests
  // that need the seat pool to bite (the reduced turn) pass a small `seats`.
  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek: dow, startTime: "12:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: opts.seats ?? 200,
    });
  }
  return r.id;
}

async function addSection(restaurantId: string, label: string) {
  const [s] = await db.insert(floorSections).values({ restaurantId, label }).returning({ id: floorSections.id });
  return s.id;
}
async function addTable(restaurantId: string, label: string, sectionId: string | null = null) {
  const [t] = await db.insert(floorTables).values({ restaurantId, label, sectionId }).returning({ id: floorTables.id });
  return t.id;
}

/** Create a booking through the real staff path, then return its row id. */
async function book(
  restaurantId: string,
  date: string,
  time: string,
  partySize: number,
  guestName: string,
  floorTableIds: string[] = [],
) {
  const res = await createManualReservation(
    restaurantId,
    { date, time, partySize, guestName, guestPhone: "0740000000", floorTableIds },
    false,
  );
  if (!res.ok) return { ok: false as const, reason: res.reason, conflicts: (res as any).conflicts ?? [] };
  const [row] = await db
    .select({ id: reservations.id, floorTableIds: reservations.floorTableIds, turnMinutes: reservations.turnMinutes })
    .from(reservations)
    .where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.guestName, guestName)))
    .limit(1);
  return { ok: true as const, id: row.id, floorTableIds: row.floorTableIds, turnMinutes: row.turnMinutes };
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing to run: DATABASE_URL is not the DEV branch.");
  }
  await cleanup();

  const D = dateForDow(3); // a fixed weekday, well inside the booking window

  // ── 1. The core rule ──────────────────────────────────────────────────────────
  sec("1. A pinned table is held for that booking's interval");
  const r1 = await makeRestaurant("core");
  const s1 = await addSection(r1, "Sala 1");
  const m1 = await addTable(r1, "m1", s1);
  const m2 = await addTable(r1, "m2", s1);
  const m3 = await addTable(r1, "m3", s1);

  const x = await book(r1, D, "19:00", 4, "Popescu", [m1, m3]);
  ok(x.ok, "booking X saved with m1 + m3");
  ok(x.ok && JSON.parse(x.floorTableIds ?? "[]").length === 2, "both tables persisted on the booking");

  // 19:00 + 90 = 20:30, so 20:00 overlaps.
  const clash = await book(r1, D, "20:00", 2, "Ionescu", [m1]);
  ok(!clash.ok, "an overlapping booking is refused m1");
  ok(!clash.ok && /Popescu/.test(clash.reason ?? ""), `the refusal names who holds it — "${!clash.ok ? clash.reason : ""}"`);
  ok(!clash.ok && clash.conflicts[0]?.label === "m1", "the conflict carries the table label");

  // Refused BEFORE the insert — no half-created booking.
  const after = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.restaurantId, r1));
  ok(after.length === 1, "the refused booking was not created at all");

  const free = await book(r1, D, "20:00", 2, "Georgescu", [m2]);
  ok(free.ok, "a free table at the same time is accepted");

  // ── 2. Back-to-back ───────────────────────────────────────────────────────────
  sec("2. Back-to-back bookings share a table");
  const backToBack = await book(r1, D, "20:30", 2, "Marin", [m1]);
  ok(backToBack.ok, "20:30 gets m1 — X ran 19:00–20:30, so they don't overlap");

  // ── 3. Long turn ──────────────────────────────────────────────────────────────
  sec("3. The longer turn for big parties holds the table longer");
  const r2 = await makeRestaurant("long", { turn: 90, longTurn: { from: 6, minutes: 120 }, allowReduced: false });
  const t2a = await addTable(r2, "m1");
  const big = await book(r2, D, "19:00", 8, "Grup mare", [t2a]);
  ok(big.ok && big.turnMinutes === 120, "an 8-person booking is stored with the 120-min long turn");

  const at2030 = await book(r2, D, "20:30", 2, "Prea devreme", [t2a]);
  ok(!at2030.ok, "20:30 is refused — the long booking runs to 21:00");
  const at2100 = await book(r2, D, "21:00", 2, "La fix", [t2a]);
  ok(at2100.ok, "21:00 is accepted — exactly when the long booking ends");

  // ── 4. Reduced turn ───────────────────────────────────────────────────────────
  sec("4. A booking stored at the REDUCED turn releases its table earlier");
  // The reduced turn is decided by the SEAT pool, not by the floor plan (which never
  // touches availability). So squeeze the seats: 10 covers, and a 4-person booking at
  // 20:30 leaves the 19:00 big party room for 90 minutes but not for its full 120.
  const r3 = await makeRestaurant("reduced", { turn: 90, longTurn: { from: 6, minutes: 120 }, allowReduced: true, seats: 10 });
  const t3 = await addTable(r3, "m1");
  const blocker = await book(r3, D, "20:30", 4, "Blocaj seats", []);
  ok(blocker.ok, "a 4-person booking at 20:30 squeezes the seat pool (holds no table)");
  const squeezed = await book(r3, D, "19:00", 8, "Grup redus", [t3]);
  ok(squeezed.ok, "the big party still fits at 19:00, at the reduced duration");
  ok(squeezed.ok && squeezed.turnMinutes === 90, `stored with 90 min, not 120 (got ${squeezed.ok ? squeezed.turnMinutes : "-"})`);
  // The payoff: the table follows the STORED duration, so it frees at 20:30, not 21:00.
  const duringReduced = await book(r3, D, "20:00", 2, "În timpul", [t3]);
  ok(!duringReduced.ok, "20:00 is still refused — the party holds m1 until 20:30");
  const afterReduced = await book(r3, D, "20:30", 2, "După", [t3]);
  ok(afterReduced.ok, "20:30 gets m1 — released at the reduced end, which a 120-min hold would not have");

  // ── 5. Non-retroactive ────────────────────────────────────────────────────────
  sec("5. Changing the turn setting never moves an existing booking");
  const r4 = await makeRestaurant("retro", { turn: 90 });
  const t4 = await addTable(r4, "m1");
  const early = await book(r4, D, "19:00", 2, "Devreme", [t4]);
  ok(early.ok && early.turnMinutes === 90, "booked while the turn was 90 min");
  // The owner now doubles the standard turn.
  await db.update(restaurants).set({ reservationTurnMinutes: 180 }).where(eq(restaurants.id, r4));
  const stillFree = await validateFloorTables(r4, D, "20:30", 90, [t4]);
  ok(stillFree.ok, "20:30 is still free — the old booking still releases at 20:30, not 22:00");

  // ── 6. Cancelled / declined release the table ─────────────────────────────────
  sec("6. Cancelling or declining frees the tables immediately");
  const r5 = await makeRestaurant("cancel");
  const t5 = await addTable(r5, "m1");
  const doomed = await book(r5, D, "19:00", 2, "Anulat", [t5]);
  ok(doomed.ok, "booking created holding m1");
  ok(!(await validateFloorTables(r5, D, "19:30", 90, [t5])).ok, "while live, an overlapping booking can't have m1");
  await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, doomed.ok ? doomed.id : ""));
  ok((await validateFloorTables(r5, D, "19:30", 90, [t5])).ok, "after cancelling, m1 is free again");
  await db.update(reservations).set({ status: "declined" }).where(eq(reservations.id, doomed.ok ? doomed.id : ""));
  ok((await validateFloorTables(r5, D, "19:30", 90, [t5])).ok, "a declined booking holds nothing either");

  // ── 7. Editing a booking ──────────────────────────────────────────────────────
  sec("7. Moving a booking re-checks its tables");
  const r6 = await makeRestaurant("edit");
  const t6a = await addTable(r6, "m1");
  const t6b = await addTable(r6, "m2");
  const holder = await book(r6, D, "21:00", 2, "Ocupant", [t6a]);
  const mover = await book(r6, D, "18:00", 2, "Mutabil", [t6b]);
  ok(holder.ok && mover.ok, "two bookings: one on m1 at 21:00, one on m2 at 18:00");

  // Clean move — m2 stays free at 15:00, so the assignment survives.
  const clean = await updateReservation(r6, mover.ok ? mover.id : "", { date: D, time: "15:00", partySize: 2 }, false);
  ok(clean.ok && clean.floorTablesCleared.length === 0, "a clean move keeps the table");
  const afterClean = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, mover.ok ? mover.id : ""));
  ok(JSON.parse(afterClean[0]?.f ?? "[]")[0] === t6b, "m2 is still pinned after the move");

  // Now move it ONTO m1's window while asking to keep m1 → cleared and reported.
  await setFloorTables(r6, mover.ok ? mover.id : "", [t6b]);
  const conflicting = await updateReservation(
    r6, mover.ok ? mover.id : "", { date: D, time: "21:00", partySize: 2, floorTableIds: [t6a] }, false,
  );
  ok(conflicting.ok && conflicting.floorTablesCleared.length === 1, "moving onto a taken table clears the assignment");
  ok(conflicting.ok && conflicting.floorTablesCleared[0] === "m1", "and reports which table was lost, by name");
  const afterClash = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, mover.ok ? mover.id : ""));
  ok(afterClash[0]?.f === null, "the booking is left with no table, not a stale one");
  const stillThere = await db.select({ s: reservations.status, t: reservations.time }).from(reservations).where(eq(reservations.id, mover.ok ? mover.id : ""));
  ok(stillThere[0]?.t === "21:00" && stillThere[0]?.s !== "cancelled", "the booking itself moved and survived — the seating note never blocks an edit");

  // ── 8. Deleting vs deactivating a table ───────────────────────────────────────
  sec("8. Deleting a table detaches it; deactivating keeps it");
  const r7 = await makeRestaurant("delete");
  const t7a = await addTable(r7, "m1");
  const t7b = await addTable(r7, "m2");
  const pinned = await book(r7, D, "19:00", 2, "Fixat", [t7a, t7b]);
  ok(pinned.ok, "booking pinned to m1 + m2");
  const at = await bookingsAtFloorTable(r7, t7a);
  ok(at.length === 1 && at[0].guestName === "Fixat", "the delete guard finds the affected booking");

  await db.update(floorTables).set({ isActive: false }).where(eq(floorTables.id, t7a));
  const afterDeactivate = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, pinned.ok ? pinned.id : ""));
  ok(JSON.parse(afterDeactivate[0]?.f ?? "[]").length === 2, "deactivating leaves the booking's tables untouched");
  const statusAfterDeactivate = await floorTableStatus(r7, D, "19:00", { partySize: 2 });
  ok(statusAfterDeactivate.tables.find((t) => t.id === t7a)?.isActive === false, "a deactivated table is flagged inactive for the picker");

  const detached = await detachFloorTable(r7, t7a);
  await db.delete(floorTables).where(eq(floorTables.id, t7a));
  ok(detached === 1, "deleting detaches exactly the affected booking");
  const afterDelete = await db.select({ f: reservations.floorTableIds, s: reservations.status }).from(reservations).where(eq(reservations.id, pinned.ok ? pinned.id : ""));
  ok(JSON.parse(afterDelete[0]?.f ?? "[]").length === 1, "the OTHER table stays pinned — only the deleted id is stripped");
  ok(afterDelete[0]?.s === "confirmed", "the booking itself is untouched by a table deletion");

  // ── 9. Deleting a section ─────────────────────────────────────────────────────
  sec("9. Deleting a section keeps its tables and their assignments");
  const r8 = await makeRestaurant("section");
  const s8 = await addSection(r8, "Sala 1");
  const t8 = await addTable(r8, "m1", s8);
  const inSection = await book(r8, D, "19:00", 2, "Secțiune", [t8]);
  ok(inSection.ok, "booking pinned to a table inside a section");
  await db.delete(floorSections).where(eq(floorSections.id, s8));
  const orphan = (await getFloorTables(r8)).find((t) => t.id === t8);
  ok(!!orphan, "the table survives the section being deleted");
  ok(orphan?.sectionId === null, "and falls back to „Fără secțiune”");
  const stillPinned = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, inSection.ok ? inSection.id : ""));
  ok(JSON.parse(stillPinned[0]?.f ?? "[]")[0] === t8, "the booking's assignment is intact");

  // ── 10. The invariant sweep ───────────────────────────────────────────────────
  sec("10. INVARIANT — no two live bookings sharing a table ever overlap");
  const r9 = await makeRestaurant("sweep", { turn: 90, longTurn: { from: 6, minutes: 120 }, allowReduced: true });
  const sweepTables = [await addTable(r9, "m1"), await addTable(r9, "m2"), await addTable(r9, "m3")];
  let placed = 0, refused = 0;
  const times = ["12:00", "13:00", "13:30", "15:00", "16:30", "18:00", "19:00", "19:30", "20:00", "21:00", "21:30"];
  for (let i = 0; i < times.length; i++) {
    for (const tbl of sweepTables) {
      const party = i % 3 === 0 ? 8 : 2; // mix long-turn and ordinary bookings
      const res = await book(r9, D, times[i], party, `Sweep ${i}-${tbl.slice(0, 4)}`, [tbl]);
      res.ok ? placed++ : refused++;
    }
  }
  ok(placed > 0 && refused > 0, `sweep placed ${placed} bookings and refused ${refused} (both paths exercised)`);

  const live = await db
    .select({ id: reservations.id, time: reservations.time, turnMinutes: reservations.turnMinutes, f: reservations.floorTableIds, name: reservations.guestName })
    .from(reservations)
    .where(eq(reservations.restaurantId, r9));
  let overlaps = 0;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const shared = JSON.parse(a.f ?? "[]").filter((id: string) => JSON.parse(b.f ?? "[]").includes(id));
      if (shared.length === 0) continue;
      const aS = toMinutes(a.time), aE = aS + (a.turnMinutes ?? 90);
      const bS = toMinutes(b.time), bE = bS + (b.turnMinutes ?? 90);
      if (aS < bE && bS < aE) {
        overlaps++;
        console.log(`      CLASH: ${a.name} ${a.time}+${a.turnMinutes} vs ${b.name} ${b.time}+${b.turnMinutes}`);
      }
    }
  }
  ok(overlaps === 0, `no double-held table across all ${live.length} bookings (${overlaps} clashes)`);

  // ── 11. The public engine is untouched ────────────────────────────────────────
  sec("11. Public availability is identical with and without a floor plan");
  const r10 = await makeRestaurant("engine");
  const before = await availabilityForDay(r10, D, 4);
  const e1 = await addTable(r10, "m1");
  const e2 = await addTable(r10, "m2");
  const midway = await availabilityForDay(r10, D, 4);
  ok(JSON.stringify(before.slots) === JSON.stringify(midway.slots), "adding tables changes nothing for clients");
  const eb = await book(r10, D, "19:00", 4, "Client", [e1, e2]);
  ok(eb.ok, "a booking is made holding both tables");
  const afterAll = await availabilityForDay(r10, D, 4);
  // The booking consumes SEATS (as it always did); what must not change is that the
  // floor plan itself plays no part. A same-size booking with no tables must match.
  const r11 = await makeRestaurant("engine-none");
  await book(r11, D, "19:00", 4, "Client fără mese", []);
  const control = await availabilityForDay(r11, D, 4);
  ok(JSON.stringify(afterAll.slots) === JSON.stringify(control.slots), "pinned vs unpinned booking → identical client availability");

  // ── 12. Optional end to end, and cross-tenant ─────────────────────────────────
  sec("12. Assignment is optional; ids are scoped to the restaurant");
  const r12 = await makeRestaurant("optional");
  const o1 = await addTable(r12, "m1");
  const plain = await book(r12, D, "19:00", 4, "Fără masă", []);
  ok(plain.ok, "a booking with no tables saves normally");
  const plainRow = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, plain.ok ? plain.id : ""));
  ok(plainRow[0]?.f === null, "and stores NULL, not an empty array");
  ok((await validateFloorTables(r12, D, "19:00", 90, [o1])).ok, "an unassigned booking blocks nothing");

  const board = await listUpcomingReservations(r12);
  ok(board[0]?.floorTables.length === 0, "the board reports no tables — nothing to render");

  const assigned = await setFloorTables(r12, plain.ok ? plain.id : "", [o1]);
  ok(assigned.ok, "tables can be added later, from the card");
  const cleared = await setFloorTables(r12, plain.ok ? plain.id : "", []);
  ok(cleared.ok, "and cleared again — an empty list is a success, not an error");
  const clearedRow = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, plain.ok ? plain.id : ""));
  ok(clearedRow[0]?.f === null, "clearing writes NULL back");

  const foreign = await validateFloorTables(r12, D, "19:00", 90, [t7b]);
  ok(!foreign.ok, "a table id from ANOTHER restaurant is refused");
  const setForeign = await setFloorTables(r12, plain.ok ? plain.id : "", [t7b]);
  ok(!setForeign.ok, "and can't be forced in through the assign endpoint either");

  sec("13. The board only offers the picker when there's something to pick");
  const r13 = await makeRestaurant("gate");
  ok(!(await floorPlanEnabled(r13)), "no tables → feature off");
  const g1 = await addTable(r13, "m1");
  ok(await floorPlanEnabled(r13), "one active table → feature on");
  await db.update(floorTables).set({ isActive: false }).where(eq(floorTables.id, g1));
  ok(!(await floorPlanEnabled(r13)), "every table out of use → feature off again");
  await db.update(floorTables).set({ isActive: true }).where(eq(floorTables.id, g1));
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r13));
  ok(!(await floorPlanEnabled(r13)), "„Mese individuale” → feature off (that mode assigns its own tables)");

  // ── 14. Switching to „Mese individuale” and back ──────────────────────────────
  //
  // The two table systems must never be visible at once. In tables mode the engine
  // assigns real tables by itself, so a leftover hand-picked name shown next to the
  // automatic one would be two different tables for one booking — and unclearable, since
  // the picker is gone there. The data must survive the round trip untouched, though:
  // switching mode is not a reason to lose the owner's seating notes.
  sec("14. „Mese individuale” hides the floor plan without destroying it");
  const r14 = await makeRestaurant("modeswitch");
  const f14 = await addTable(r14, "m1");
  const b14 = await book(r14, D, "19:00", 4, "Comutare", [f14]);
  ok(b14.ok, "a seats-mode booking is pinned to m1");
  ok(await floorPlanEnabled(r14), "the picker is offered while on „Capacitate totală”");
  let board14 = await listUpcomingReservations(r14);
  ok(board14[0].floorTables.length === 1, "and the card carries the m1 chip");

  // Switch to tables mode, with a real capacity table so the engine can seat the booking.
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r14));
  await db.insert(reservationTables).values({ restaurantId: r14, label: "Masa 7", seats: 4 });
  const bf14 = await backfillTableAssignments(r14);
  ok(bf14.assigned === 1, "the mode switch seats the booking on a real capacity table");
  ok(!(await floorPlanEnabled(r14)), "the floor plan reports itself OFF → the board hides the chip and the „Mese” button");
  board14 = await listUpcomingReservations(r14);
  ok(board14[0].tables.length === 1, "the automatic assignment shows instead");

  // An edit must not touch (or complain about) the hidden assignment.
  const up14 = await updateReservation(r14, b14.ok ? b14.id : "", { date: D, time: "19:30", partySize: 4 }, false);
  ok(up14.ok && up14.floorTablesCleared.length === 0, "editing in tables mode raises no „pick another table” prompt");
  const kept14 = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, b14.ok ? b14.id : ""));
  ok(JSON.parse(kept14[0]?.f ?? "[]")[0] === f14, "and the hidden assignment is preserved exactly");

  // The board must not even RECEIVE the other system's tables. Gating it in the UI alone
  // was not enough: the board gets the mode as a server-rendered prop, so switching mode
  // in another tab left an open board rendering the wrong system until a reload.
  ok(board14[0].floorTables.length === 0, "the „Plan de sală” tables are not sent at all in „Mese individuale”");
  ok(board14[0].floorTableIds.length === 0, "nor their ids — nothing for a stale page to render");

  // Back to „Capacitate totală” — the plan returns as it was.
  await db.update(restaurants).set({ reservationCapacityMode: "seats" }).where(eq(restaurants.id, r14));
  ok(await floorPlanEnabled(r14), "switching back turns the floor plan on again");
  board14 = await listUpcomingReservations(r14);
  ok(board14[0].floorTables[0] === "m1", "with the original seating note intact");

  // …and the MIRROR case: the capacity table this restaurant was assigned while in
  // „Mese individuale” must not linger on its cards now that it is back on seats.
  ok(board14[0].tables.length === 0, "the „Mese individuale” table is not shown on a „Capacitate totală” restaurant");
  const rawRow = await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.id, b14.ok ? b14.id : ""));
  ok(rawRow[0]?.a !== null, "though the value is still in the row, ready for a switch back — hidden, not destroyed");

  await cleanup();
  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
