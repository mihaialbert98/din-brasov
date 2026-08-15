/**
 * „Schimbă masa” — the owner overriding the automatically-chosen table in „Mese
 * individuale”.
 *
 * The mode exists so a party is never put where it doesn't fit, so an override has to obey
 * the same two facts the engine obeys: the table must SEAT the party and must be FREE.
 * Both are hard blocks. What the override adds is that the owner's choice then STICKS —
 * an edit must not quietly hand the booking back to the automatic chooser.
 *
 * Proves:
 *   - a table too small for the party is refused, naming the numbers
 *   - a table held by an overlapping booking is refused, naming who has it
 *   - several tables can be combined; their seats add up
 *   - interior and terasă can never be combined
 *   - a chosen table SURVIVES an edit that leaves it valid (time change, party shrink)
 *   - it is handed back to the engine when the edit breaks it (party outgrows it, or the
 *     new time collides) — and the caller is told, with the old and new labels
 *   - the choice is honoured on a FORCED edit too
 *   - an overridden table blocks other bookings exactly like an automatic one
 *   - CONCURRENCY: two staff overriding onto one table cannot both win
 *   - cross-tenant table ids are refused
 *   - nothing here leaks into „Capacitate totală” or into „Plan de sală”
 *
 * Throwaway restaurants (slug tblov-*), self-cleaning. No email, no network.
 *
 * Run: pnpm tsx scripts/test-table-override.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, floorTables } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { createManualReservation, updateReservation, listUpcomingReservations, availabilityForDay, backfillTableAssignments } from "../lib/reservations";
import { tableOptionsFor, validateTableOverride, setReservationTables, manualChoiceStillWorks } from "../lib/table-override";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "tblov-";

function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (new Date(`${iso}T00:00:00`).getDay() === dow) return iso;
  }
  throw new Error("no date");
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(floorTables).where(inArray(floorTables.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function makeRestaurant(key: string, opts: { mode?: "seats" | "tables"; areas?: boolean } = {}) {
  const slug = `${P}${key}`;
  const [pl] = await db.insert(places).values({
    name: `Ovr ${key}`, description: "test", slug, category: "Restaurant", address: "Brașov", status: "published",
  }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `Ovr ${key}`, slug, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true, reservationConfirmMode: "auto",
    reservationCapacityMode: opts.mode ?? "tables",
    reservationAreasEnabled: !!opts.areas,
    reservationTurnMinutes: 90, reservationMaxPartySize: 30, reservationAdvanceDays: 60, reservationMaxJoin: 2,
  }).returning({ id: restaurants.id });
  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek: dow, startTime: "12:00", endTime: "22:00", slotMinutes: 30,
      seatsPerSlot: 200, seatsInside: 100, seatsOutside: 100,
    });
  }
  return r.id;
}

async function addTable(restaurantId: string, label: string, seats: number, area: string | null = null, joinable = true) {
  const [t] = await db.insert(reservationTables).values({ restaurantId, label, seats, area, joinable })
    .returning({ id: reservationTables.id });
  return t.id;
}

async function book(restaurantId: string, date: string, time: string, partySize: number, guestName: string, area?: "inside" | "outside") {
  const res = await createManualReservation(restaurantId, { date, time, partySize, guestName, guestPhone: "0740000000", area }, false);
  if (!res.ok) return { ok: false as const, reason: res.reason };
  const [row] = await db
    .select({ id: reservations.id, assignedTableIds: reservations.assignedTableIds, manual: reservations.assignedTablesManual })
    .from(reservations)
    .where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.guestName, guestName)))
    .limit(1);
  return { ok: true as const, id: row.id, assigned: JSON.parse(row.assignedTableIds ?? "[]") as string[], manual: row.manual };
}

const idsOf = async (reservationId: string) => {
  const [r] = await db.select({ a: reservations.assignedTableIds, m: reservations.assignedTablesManual })
    .from(reservations).where(eq(reservations.id, reservationId));
  return { ids: JSON.parse(r?.a ?? "[]") as string[], manual: r?.m ?? false };
};

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing to run: DATABASE_URL is not the DEV branch.");
  }
  await cleanup();
  const D = dateForDow(3);

  // ── 1. Size is a hard block ───────────────────────────────────────────────────
  sec("1. A table that can't seat the party is refused");
  const r1 = await makeRestaurant("size");
  const small = await addTable(r1, "Masa 3", 4);
  const mid = await addTable(r1, "Masa 7", 6);
  const big = await addTable(r1, "Masa 9", 8);

  const b1 = await book(r1, D, "19:00", 6, "Popescu");
  ok(b1.ok, "a 6-person booking is created");
  ok(b1.ok && b1.assigned[0] === mid, "the engine picked the smallest table that fits (Masa 7)");
  ok(b1.ok && b1.manual === false, "and it is NOT marked as a manual choice");

  const tooSmall = await validateTableOverride(r1, D, "19:00", 6, 90, [small]);
  ok(!tooSmall.ok, "moving 6 people onto a 4-seat table is refused");
  ok(!tooSmall.ok && /4/.test(tooSmall.reason) && /6/.test(tooSmall.reason), `and the message states both numbers — "${!tooSmall.ok ? tooSmall.reason : ""}"`);

  const bigger = await setReservationTables(r1, b1.ok ? b1.id : "", [big]);
  ok(bigger.ok, "moving them onto the bigger Masa 9 is allowed");
  const after1 = await idsOf(b1.ok ? b1.id : "");
  ok(after1.ids[0] === big, "the booking now holds Masa 9");
  ok(after1.manual === true, "and is flagged as chosen by staff");

  // ── 2. Availability is a hard block ───────────────────────────────────────────
  sec("2. A table an overlapping booking holds is refused");
  const b2 = await book(r1, D, "20:00", 4, "Ionescu");
  ok(b2.ok, "a second booking at 20:00 is created");
  const taken = await validateTableOverride(r1, D, "20:00", 4, 90, [big], b2.ok ? b2.id : undefined);
  ok(!taken.ok, "Masa 9 is refused — Popescu holds it 19:00–20:30");
  ok(!taken.ok && /Popescu/.test(taken.reason), "and the message names who has it");

  const freeLater = await validateTableOverride(r1, D, "20:30", 4, 90, [big]);
  ok(freeLater.ok, "at 20:30 the same table is free again (back-to-back is fine)");

  // ── 3. Combining tables ───────────────────────────────────────────────────────
  sec("3. Several tables can be combined — the seats add up");
  const r3 = await makeRestaurant("join");
  const j1 = await addTable(r3, "Masa 1", 4);
  const j2 = await addTable(r3, "Masa 2", 4);
  const j3 = await addTable(r3, "Masa 3", 2);
  const b3 = await book(r3, D, "19:00", 7, "Grup");
  ok(b3.ok, "a 7-person booking is created");
  const one = await validateTableOverride(r3, D, "19:00", 7, 90, [j1], b3.ok ? b3.id : undefined);
  ok(!one.ok, "a single 4-seat table is not enough for 7");
  const two = await validateTableOverride(r3, D, "19:00", 7, 90, [j1, j2], b3.ok ? b3.id : undefined);
  ok(two.ok, "Masa 1 + Masa 2 = 8 seats → accepted");
  const three = await validateTableOverride(r3, D, "19:00", 7, 90, [j1, j3], b3.ok ? b3.id : undefined);
  ok(!three.ok, "Masa 1 + Masa 3 = 6 seats → still refused");
  const setJoin = await setReservationTables(r3, b3.ok ? b3.id : "", [j1, j2]);
  ok(setJoin.ok && (await idsOf(b3.ok ? b3.id : "")).ids.length === 2, "the combination is saved as two tables");

  // ── 4. Areas can't be combined ────────────────────────────────────────────────
  sec("4. Interior and terasă can never be pushed together");
  const r4 = await makeRestaurant("areas", { areas: true });
  const inside = await addTable(r4, "Masa I", 4, "inside");
  const outside = await addTable(r4, "Masa T", 4, "outside");
  const b4 = await book(r4, D, "19:00", 6, "Zone", "inside");
  const mixed = await validateTableOverride(r4, D, "19:00", 6, 90, [inside, outside], b4.ok ? b4.id : undefined);
  ok(!mixed.ok, "an interior + terasă combination is refused");
  ok(!mixed.ok && /zone diferite/.test(mixed.reason), "with the physical reason, not a seat count");

  // ── 5. The choice survives an edit ────────────────────────────────────────────
  sec("5. A chosen table sticks through edits that leave it valid");
  const r5 = await makeRestaurant("sticky");
  const s1 = await addTable(r5, "Masa 1", 4);
  const s2 = await addTable(r5, "Masa 2", 4);
  const b5 = await book(r5, D, "19:00", 2, "Fidel");
  ok(b5.ok && b5.assigned[0] === s1, "the engine picked Masa 1");
  await setReservationTables(r5, b5.ok ? b5.id : "", [s2]);
  ok((await idsOf(b5.ok ? b5.id : "")).ids[0] === s2, "staff moved them to Masa 2");

  const moveTime = await updateReservation(r5, b5.ok ? b5.id : "", { date: D, time: "15:00", partySize: 2 }, false);
  ok(moveTime.ok, "the booking is moved to 15:00");
  const afterMove = await idsOf(b5.ok ? b5.id : "");
  ok(afterMove.ids[0] === s2, "and is STILL on Masa 2 — the engine did not re-pick");
  ok(afterMove.manual === true, "the manual flag survives");
  ok(moveTime.ok && moveTime.tableTakenOver === null, "nothing is reported, because nothing changed");

  const shrink = await updateReservation(r5, b5.ok ? b5.id : "", { date: D, time: "15:00", partySize: 1 }, false);
  ok(shrink.ok && (await idsOf(b5.ok ? b5.id : "")).ids[0] === s2, "shrinking the party keeps the table too");

  // ── 6. …and is handed back when it stops working ──────────────────────────────
  sec("6. When an edit breaks the choice, the engine takes over — and says so");
  const grow = await updateReservation(r5, b5.ok ? b5.id : "", { date: D, time: "15:00", partySize: 4 }, false);
  ok(grow.ok, "growing to 4 still fits Masa 2 (4 seats)");
  ok(grow.ok && (await idsOf(b5.ok ? b5.id : "")).ids[0] === s2, "so it is kept");

  const outgrow = await updateReservation(r5, b5.ok ? b5.id : "", { date: D, time: "15:00", partySize: 8 }, true);
  ok(outgrow.ok, "growing to 8 no longer fits a 4-seat table");
  const afterOutgrow = await idsOf(b5.ok ? b5.id : "");
  ok(afterOutgrow.manual === false, "the manual flag is dropped — the engine owns it again");
  ok(outgrow.ok && outgrow.tableTakenOver !== null, "and the change is REPORTED, not silent");
  ok(outgrow.ok && outgrow.tableTakenOver?.from[0] === "Masa 2", "naming the table they had chosen");

  // A collision at the new time also hands it back.
  const r6 = await makeRestaurant("collide");
  const c1 = await addTable(r6, "Masa 1", 4);
  const c2 = await addTable(r6, "Masa 2", 4);
  const holder = await book(r6, D, "21:00", 2, "Ocupant");
  await setReservationTables(r6, holder.ok ? holder.id : "", [c1]);
  const mover = await book(r6, D, "13:00", 2, "Mutabil");
  await setReservationTables(r6, mover.ok ? mover.id : "", [c1]); // free at 13:00
  ok((await idsOf(mover.ok ? mover.id : "")).ids[0] === c1, "both bookings chose Masa 1 at non-overlapping times");
  const collide = await updateReservation(r6, mover.ok ? mover.id : "", { date: D, time: "21:00", partySize: 2 }, false);
  ok(collide.ok, "moving the second one onto 21:00 succeeds");
  ok((await idsOf(mover.ok ? mover.id : "")).ids[0] === c2, "but it lands on Masa 2 — Masa 1 was taken");
  ok(collide.ok && collide.tableTakenOver?.to[0] === "Masa 2", "and the message says where it went");

  // ── 7. An overridden table blocks others, exactly like an automatic one ───────
  sec("7. An overridden table is a real hold");
  const r7 = await makeRestaurant("holds");
  await addTable(r7, "Masa 1", 4); // a smaller table the engine would prefer
  const h2 = await addTable(r7, "Masa 2", 8);
  const first = await book(r7, D, "19:00", 2, "Primul");
  await setReservationTables(r7, first.ok ? first.id : "", [h2]); // deliberately the big one
  ok((await idsOf(first.ok ? first.id : "")).ids[0] === h2, "a 2-person booking is parked on the 8-seat table");
  const bigParty = await book(r7, D, "19:30", 8, "Grup mare");
  ok(!bigParty.ok, "an 8-person booking at 19:30 is now refused — the only table that fits is held");
  const afterHold = await validateTableOverride(r7, D, "20:30", 8, 90, [h2]);
  ok(afterHold.ok, "at 20:30, once the hold ends, it's available again");

  // ── 7b. The flag must never outlive the choice ────────────────────────────────
  //
  // Deleting a table someone had chosen by hand clears the booking and lets the engine
  // re-seat it. If the manual flag survived that, the booking would be pinned to a table
  // NOBODY chose — the engine would stop optimising it, and a later edit would announce
  // „masa aleasă de tine s-a schimbat” about a choice that was never made.
  sec("7b. Deleting a chosen table hands the booking back to the engine, flag and all");
  const r7b = await makeRestaurant("flag");
  const f1 = await addTable(r7b, "Masa 1", 4);
  const f2 = await addTable(r7b, "Masa 2", 4);
  const bf = await book(r7b, D, "19:00", 2, "Steag");
  await setReservationTables(r7b, bf.ok ? bf.id : "", [f2]);
  ok((await idsOf(bf.ok ? bf.id : "")).manual === true, "the choice is flagged as staff's");

  // Exactly what the delete-table route does: clear the affected bookings, drop the
  // table, re-seat what's left.
  await db.update(reservations)
    .set({ assignedTableIds: null, assignedTablesManual: false })
    .where(eq(reservations.id, bf.ok ? bf.id : ""));
  await db.delete(reservationTables).where(eq(reservationTables.id, f2));
  const report = await backfillTableAssignments(r7b);
  ok(report.assigned === 1, "the booking is re-seated on what remains");
  const afterDelete = await idsOf(bf.ok ? bf.id : "");
  ok(afterDelete.ids[0] === f1, "on Masa 1, chosen by the engine");
  ok(afterDelete.manual === false, "and the manual flag is GONE — the engine owns it again");

  const editAfter = await updateReservation(r7b, bf.ok ? bf.id : "", { date: D, time: "20:00", partySize: 2 }, false);
  ok(editAfter.ok && editAfter.tableTakenOver === null, "so a later edit never blames staff for a choice they didn't make");

  // ── 8. Concurrency ────────────────────────────────────────────────────────────
  sec("8. CONCURRENCY — two staff overriding onto the same table");
  const r8 = await makeRestaurant("race");
  const rt = await addTable(r8, "Masa 1", 8);
  await addTable(r8, "Masa 2", 8);
  await addTable(r8, "Masa 3", 8);
  let both = 0, exactlyOne = 0;
  const ROUNDS = 10;
  for (let i = 0; i < ROUNDS; i++) {
    const a = await book(r8, D, "13:00", 2, `Race A${i}`);
    const b = await book(r8, D, "13:30", 2, `Race B${i}`);
    const [x, y] = await Promise.all([
      setReservationTables(r8, a.ok ? a.id : "", [rt]),
      setReservationTables(r8, b.ok ? b.id : "", [rt]),
    ]);
    const holding = [(await idsOf(a.ok ? a.id : "")).ids, (await idsOf(b.ok ? b.id : "")).ids]
      .filter((ids) => ids.includes(rt)).length;
    if (holding === 2) { both++; console.log(`      round ${i}: BOTH held Masa 1 (${x.ok}/${y.ok})`); }
    else if (holding === 1) exactlyOne++;
    await db.delete(reservations).where(inArray(reservations.id, [a.ok ? a.id : "", b.ok ? b.id : ""]));
  }
  console.log(`      ${ROUNDS} rounds: exactly-one=${exactlyOne} both=${both}`);
  ok(both === 0, `no round put two overlapping bookings on one table (${both} did)`);
  ok(exactlyOne === ROUNDS, `exactly one winner every round (${exactlyOne}/${ROUNDS})`);

  // ── 9. Scope ──────────────────────────────────────────────────────────────────
  sec("9. Cross-tenant, and no bleed into the other modes");
  const foreign = await validateTableOverride(r1, D, "19:00", 2, 90, [j1]); // r3's table
  ok(!foreign.ok, "another restaurant's table is refused");
  const wrongRestaurant = await setReservationTables(r3, b1.ok ? b1.id : "", [j1]); // r1's booking
  ok(!wrongRestaurant.ok && wrongRestaurant.status === 404, "and a booking can't be reached from another restaurant");

  const seatsRestaurant = await makeRestaurant("seatsmode", { mode: "seats" });
  await addTable(seatsRestaurant, "Masa 1", 4);
  const seatsBooking = await book(seatsRestaurant, D, "19:00", 2, "Capacitate");
  ok(seatsBooking.ok && seatsBooking.assigned.length === 0, "in „Capacitate totală” no table is assigned at all");
  const stillWorks = await manualChoiceStillWorks(seatsRestaurant, seatsBooking.ok ? seatsBooking.id : "", D, "19:00", 2, 90);
  ok(!stillWorks.keep, "and there is no manual choice to preserve there");

  // The board's data for a tables-mode booking shows the capacity table, not a floor one.
  const board = await listUpcomingReservations(r1);
  const popescu = board.find((b) => b.guestName === "Popescu");
  ok(popescu?.tables[0] === "Masa 9", "the board shows the overridden table");
  ok(popescu?.floorTables.length === 0, "and no „Plan de sală” table — the two never mix");

  // ── 10. The picker payload ────────────────────────────────────────────────────
  sec("10. The picker is told size and availability for every table");
  const opts = await tableOptionsFor(r1, b2.ok ? b2.id : "");
  ok(!!opts && opts.partySize === 4, "the options load for the booking");
  const rowBig = opts?.tables.find((t) => t.id === big);
  const rowSmall = opts?.tables.find((t) => t.id === small);
  ok(rowBig?.busy?.guestName === "Popescu", "Masa 9 is reported busy, with the holder");
  ok(rowSmall?.fits === true, "Masa 3 (4 seats) fits a party of 4");
  const optsBig = await tableOptionsFor(r1, b1.ok ? b1.id : "");
  ok(optsBig?.tables.find((t) => t.id === small)?.fits === false, "and does NOT fit a party of 6");
  ok(optsBig?.manual === true, "the payload says the current choice was made by staff");

  // Public availability is unaffected by any of this.
  const avail = await availabilityForDay(r7, D, 8);
  ok(Array.isArray(avail.slots), "client availability still computes normally in tables mode");

  await cleanup();
  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
