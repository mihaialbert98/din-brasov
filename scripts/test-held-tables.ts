/**
 * Tables held back for walk-ins / phone bookings (reservation_tables.bookableOnline).
 *
 * Proves:
 *   - a held-back table is invisible to ONLINE availability but fully usable by staff
 *   - holding a table back never oversells: online capacity drops by exactly that table
 *   - it differs from isActive=false, which hides the table from staff too (and would
 *     leave a forced booking holding no table at all — the v0.24 oversell bug)
 *   - existing bookings on a table keep it when it's held back
 *   - the mode-switch backfill may seat an existing booking on a held-back table
 *   - the staff capacity snapshot counts the whole floor, the client only sees online
 *
 * Throwaway restaurant (slug hldtb-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-held-tables.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availabilityForDay, validateBooking, assignTablesFor, createManualReservation, getReservationTables, backfillTableAssignments, slotCapacitySnapshot } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "hldtb-";

function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    const iso = t.toISOString().slice(0, 10);
    if (new Date(iso + "T00:00:00").getDay() === dow) return iso;
  }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 1, date = dateForDow(dow);

  const [pl] = await db.insert(places).values({ name: "HldTb", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "HldTb", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxPartySize: 20,
    reservationMaxJoin: 1,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 30 });

  // Five 6-tops = 30 seats. The owner will hold one back for walk-ins → 24 online.
  const ids: string[] = [];
  for (const label of ["M1", "M2", "M3", "M4", "M5"]) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r.id, label, seats: 6, joinable: false }).returning({ id: reservationTables.id });
    ids.push(t.id);
  }
  const held = ids[4]; // M5

  sec("1. All tables online to begin with");
  ok((await getReservationTables(r.id)).length === 5, "online sees 5 tables");
  ok((await getReservationTables(r.id, undefined, "staff")).length === 5, "staff sees 5 tables");

  sec("2. Holding M5 back removes it from ONLINE only");
  await db.update(reservationTables).set({ bookableOnline: false }).where(eq(reservationTables.id, held));
  const online = await getReservationTables(r.id);
  const staff = await getReservationTables(r.id, undefined, "staff");
  ok(online.length === 4 && !online.some((t) => t.id === held), "online sees 4 tables — M5 is gone");
  ok(staff.length === 5 && staff.some((t) => t.id === held), "staff still sees all 5, including M5");
  ok(online.reduce((s, t) => s + t.seats, 0) === 24, "online capacity is 24 seats (30 total − the 6 held back)");

  sec("3. Online capacity drops by exactly one table — no oversell");
  // Fill the 4 online tables at 19:00 through the public gate.
  for (let i = 0; i < 4; i++) {
    const v = await validateBooking(r.id, date, "19:00", 6);
    ok(v.ok, `online booking ${i + 1}/4 accepted`);
    await db.insert(reservations).values({
      restaurantId: r.id, date, time: "19:00", partySize: 6, guestName: `G${i}`, guestPhone: "0700000000",
      status: "confirmed", turnMinutes: 90, assignedTableIds: JSON.stringify(v.assignedTableIds),
    });
  }
  const fifth = await validateBooking(r.id, date, "19:00", 6);
  ok(!fifth.ok, "the 5th online booking is REFUSED — M5 is held back, not available online");
  ok(!(await availabilityForDay(r.id, date, 6)).slots.includes("19:00"), "…and 19:00 no longer appears to clients for a party of 6");

  sec("4. Staff can still seat a party on the held-back table");
  const assignedStaff = await assignTablesFor(r.id, date, "19:00", 6, undefined, undefined, { channel: "staff" });
  ok(assignedStaff?.length === 1 && assignedStaff[0] === held, "the staff channel assigns exactly M5 — the walk-in table");
  const manual = await createManualReservation(r.id, { date, time: "19:00", partySize: 6, guestName: "Walk-in", guestPhone: "0711111111" }, false);
  ok(manual.ok, "a staff manual booking at a 'full' 19:00 succeeds WITHOUT forcing (M5 is free for them)");

  sec("5. Now the room really is full — even for staff");
  const manual2 = await createManualReservation(r.id, { date, time: "19:00", partySize: 6, guestName: "Alt", guestPhone: "0722222222" }, false);
  ok(!manual2.ok, "a further staff booking is refused (all 5 tables genuinely taken)");
  ok(!manual2.ok && manual2.overridable === true, "…but it stays overridable — staff know the real floor");

  sec("6. Held-back ≠ deactivated");
  // Deactivating hides the table from EVERYONE — including the staff assignment,
  // which is what would leave a forced booking holding no table at all.
  const [t2] = await db.select({ id: reservationTables.id }).from(reservationTables).where(eq(reservationTables.label, "M1"));
  await db.update(reservationTables).set({ isActive: false }).where(eq(reservationTables.id, t2.id));
  ok(!(await getReservationTables(r.id, undefined, "staff")).some((t) => t.id === t2.id), "a DEACTIVATED table disappears for staff too");
  ok((await getReservationTables(r.id, undefined, "staff")).some((t) => t.id === held), "…while the HELD-BACK table remains available to staff");
  await db.update(reservationTables).set({ isActive: true }).where(eq(reservationTables.id, t2.id));

  sec("7. An existing booking keeps its table when the table is held back");
  const [onHeld] = await db
    .select({ id: reservations.id, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(eq(reservations.guestName, "Walk-in"));
  ok(JSON.parse(onHeld.assignedTableIds ?? "[]").includes(held), "the walk-in booking still holds M5");
  ok(!(await availabilityForDay(r.id, date, 6)).slots.includes("19:00"), "and 19:00 stays closed to clients");

  sec("8. The mode-switch backfill may use a held-back table");
  // A booking with no table (as if carried over from 'capacitate totală') at a time
  // when only the held-back table is free must still be seated — better than leaving
  // a real guest table-less.
  await db.delete(reservations).where(eq(reservations.restaurantId, r.id));
  for (let i = 0; i < 4; i++) {
    const v = await assignTablesFor(r.id, date, "20:00", 6);
    await db.insert(reservations).values({
      restaurantId: r.id, date, time: "20:00", partySize: 6, guestName: `F${i}`, guestPhone: "0700000000",
      status: "confirmed", turnMinutes: 90, assignedTableIds: JSON.stringify(v),
    });
  }
  await db.insert(reservations).values({
    restaurantId: r.id, date, time: "20:00", partySize: 6, guestName: "Orfan", guestPhone: "0733333333",
    status: "confirmed", turnMinutes: 90, assignedTableIds: null,
  });
  const report = await backfillTableAssignments(r.id);
  ok(report.assigned === 1 && report.unassigned.length === 0, "the table-less booking was seated by the backfill");
  const [orphan] = await db.select({ assignedTableIds: reservations.assignedTableIds }).from(reservations).where(eq(reservations.guestName, "Orfan"));
  ok(JSON.parse(orphan.assignedTableIds ?? "[]").includes(held), "…on the held-back table, the only one free");

  sec("9. The staff capacity snapshot reports the whole floor");
  const snap = await slotCapacitySnapshot(r.id, date, "20:00", 2);
  ok(snap.mode === "tables", "snapshot reports tables mode");
  ok(snap.capacity === 30, `capacity counts all 5 tables = 30 seats — got ${snap.capacity}`);
  ok(snap.occupied === 30 && snap.remaining === 0, "the room is fully occupied at 20:00");
  ok(snap.fits === false, "…so a further party does not fit");
  const snapLater = await slotCapacitySnapshot(r.id, date, "21:30", 4);
  ok(snapLater.fits === true && (snapLater.freeTables ?? 0) === 5, "at 21:30 (after the turn) all 5 tables are free again");
  ok((snapLater.wouldAssign ?? []).length === 1, `…and the snapshot names the table it would use — ${snapLater.wouldAssign?.join(", ")}`);

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
