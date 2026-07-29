/**
 * Areas × tables: interior and terasă tables can NEVER be pushed together — not by
 * auto-join (ungrouped "se poate uni"), and not even via a group that mixes areas.
 * Availability is computed per area (getReservationTables filters by area), so canSeat
 * only ever sees same-area tables. Uses the real assignTablesFor. Throwaway restaurant
 * (slug areatbl-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-area-tables.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers, restaurantTables } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { assignTablesFor, listUpcomingReservations, setReservationStatus } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "areatbl-";
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    const grps = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    if (grps.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, grps.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurantTables).where(inArray(restaurantTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);

  const [pl] = await db.insert(places).values({ name: "AreaTbl", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "AreaTbl", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationAreasEnabled: true,
    reservationTurnMinutes: 90, reservationMaxJoin: 3, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 8, seatsInside: 8, seatsOutside: 8 });

  // Two 2-seat joinable tables — one inside, one on the terrace.
  const [mIn] = await db.insert(reservationTables).values({ restaurantId: r.id, label: "Int-1", seats: 2, joinable: true, area: "inside" }).returning({ id: reservationTables.id });
  const [mOut] = await db.insert(reservationTables).values({ restaurantId: r.id, label: "Ter-1", seats: 2, joinable: true, area: "outside" }).returning({ id: reservationTables.id });

  sec("1. Auto-join never crosses areas");
  ok((await assignTablesFor(r.id, date, "19:00", 2, "inside"))?.length === 1, "party 2 inside → the inside table");
  ok((await assignTablesFor(r.id, date, "19:00", 4, "inside")) === null, "party 4 inside → null (can't borrow the terrace table)");
  ok((await assignTablesFor(r.id, date, "19:00", 4, "outside")) === null, "party 4 outside → null (can't borrow the inside table)");

  sec("2. A mixed-area GROUP still can't join across areas");
  // Even if a group wrongly contains both, only the same-area member is ever free.
  const [grp] = await db.insert(reservationTableGroups).values({ restaurantId: r.id, label: "Mixed" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values([{ groupId: grp.id, tableId: mIn.id }, { groupId: grp.id, tableId: mOut.id }]);
  ok((await assignTablesFor(r.id, date, "19:00", 4, "inside")) === null, "party 4 inside via mixed group → still null (terrace member not in the inside pool)");
  ok((await assignTablesFor(r.id, date, "19:00", 2, "inside"))?.length === 1, "party 2 inside → still seats on the inside table alone");

  sec("3. Areas OFF (no area chosen) — loose join still won't cross areas");
  // Ungroup the tables so they'd fall in the loose pool, then book with NO area (as the
  // client does when the restaurant has areas turned off). Interior + terasă must NOT join.
  await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, [grp.id]));
  await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.id, [grp.id]));
  ok((await assignTablesFor(r.id, date, "19:00", 4)) === null, "party 4, no area → null (interior + terasă can't be pushed together)");
  ok((await assignTablesFor(r.id, date, "19:00", 2))?.length === 1, "party 2, no area → a single table");

  sec("4. Deactivating terrace (outside) tables closes the terrace, reversibly");
  // This is what disabling areas in tables mode does server-side.
  const outFilter = and(eq(reservationTables.restaurantId, r.id), eq(reservationTables.area, "outside"));
  await db.update(reservationTables).set({ isActive: false }).where(outFilter);
  ok((await assignTablesFor(r.id, date, "19:00", 2, "outside")) === null, "outside booking → null (terrace tables deactivated)");
  ok((await assignTablesFor(r.id, date, "19:00", 2, "inside"))?.length === 1, "interior tables still bookable");
  await db.update(reservationTables).set({ isActive: true }).where(outFilter);
  ok((await assignTablesFor(r.id, date, "19:00", 2, "outside"))?.length === 1, "reactivated → terrace bookable again");

  sec("5. Closing the terrace touches ONLY reservations (blast radius)");
  // A SERVICE table (restaurant_tables — the QR/service module) and an existing booking
  // seated on a terrace reservation table.
  const [svc] = await db.insert(restaurantTables).values({ restaurantId: r.id, label: "Service-1" }).returning({ id: restaurantTables.id });
  await db.insert(reservations).values({
    restaurantId: r.id, date, time: "19:00", partySize: 2, guestName: "Pe terasă", guestPhone: "0700000000",
    status: "confirmed", area: "outside", assignedTableIds: JSON.stringify([mOut.id]),
  });
  // Simulate turning zones OFF (what the settings route does in tables mode).
  await db.update(reservationTables).set({ isActive: false }).where(outFilter);

  const [svcAfter] = await db.select({ isActive: restaurantTables.isActive }).from(restaurantTables).where(eq(restaurantTables.id, svc.id));
  ok(svcAfter?.isActive === true, "service (QR) tables are a separate inventory — untouched");
  const [inAfter] = await db.select({ isActive: reservationTables.isActive }).from(reservationTables).where(eq(reservationTables.id, mIn.id));
  ok(inAfter?.isActive === true, "interior reservation tables stay active");

  const board = await listUpcomingReservations(r.id);
  const booking = board.find((b) => b.guestName === "Pe terasă");
  ok(!!booking, "the existing terrace booking still shows on the board");
  ok(booking?.tables?.[0] === "Ter-1", `…still resolves its table label — got ${booking?.tables?.join("+") ?? "none"}`);

  sec("6. Only FUTURE bookings change — the old one keeps its table & stays manageable");
  const [stored] = await db
    .select({ a: reservations.assignedTableIds, status: reservations.status, time: reservations.time, party: reservations.partySize })
    .from(reservations).where(eq(reservations.restaurantId, r.id)).limit(1);
  ok(JSON.parse(stored.a ?? "[]")[0] === mOut.id, "its assigned terrace table is unchanged in the DB");
  ok(stored.status === "confirmed" && stored.time === "19:00" && stored.party === 2, "status / time / party unchanged");
  // Staff can still act on it while the terrace is closed.
  const resv = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.restaurantId, r.id)).limit(1);
  ok(await setReservationStatus(r.id, resv[0].id, "confirmed"), "staff can still confirm/manage it while the terrace is closed");

  // Reopen: the old booking must STILL hold its table (no double-booking of Ter-1).
  await db.update(reservationTables).set({ isActive: true }).where(outFilter);
  ok((await assignTablesFor(r.id, date, "19:00", 2, "outside")) === null, "after reopening, Ter-1 is still held by the old booking (no double-booking)");
  ok((await assignTablesFor(r.id, date, "21:00", 2, "outside"))?.length === 1, "…but a later slot on the terrace is bookable again");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
