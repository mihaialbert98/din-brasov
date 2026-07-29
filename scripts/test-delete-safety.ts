/**
 * Deleting a TABLE (tables mode) or an INTERVAL (seats mode) must never silently
 * strand a guest or free their seat for someone else.
 *   - a table with future guests is protected: the delete is refused until confirmed
 *   - on confirm, those bookings are RE-SEATED on other tables (fresh, complete
 *     assignment) and anything that can't be seated is reported
 *   - deleting the LAST table stops online bookings (nothing offered) but never
 *     double-books, and every stranded booking is reported
 *   - deactivating instead is safe: the booking keeps its table, nobody else gets it
 *   - deleting a reservation INTERVAL never touches existing bookings — only future
 *     availability
 * Mirrors the DELETE route's logic (guard → clear → delete → backfill).
 * Throwaway restaurant (slug delsafe-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-delete-safety.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, backfillTableAssignments, bookingsSeatedAtTable, listUpcomingReservations, getReservationTableGroups } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "delsafe-";
const TURN = 90;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dateForDow(dow: number) { const d = new Date(); for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(iso(t) + "T00:00:00").getDay() === dow) return iso(t); } return ""; }
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const parse = (j: string | null): string[] => { try { return j ? JSON.parse(j) : []; } catch { return []; } };

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    const grps = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, ids));
    if (grps.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, grps.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, ids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

/** Replays exactly what the DELETE route does once the owner confirms. */
async function forceDeleteTable(restaurantId: string, tableId: string) {
  const affected = await bookingsSeatedAtTable(restaurantId, tableId);
  if (affected.length) {
    await db.update(reservations).set({ assignedTableIds: null, updatedAt: new Date() })
      .where(inArray(reservations.id, affected.map((b) => b.id)));
  }
  await db.delete(reservationTables).where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, restaurantId)));
  return backfillTableAssignments(restaurantId);
}

async function assertNoDoubleBooking(restaurantId: string, label: string) {
  const rows = await db.select({ date: reservations.date, time: reservations.time, status: reservations.status, a: reservations.assignedTableIds, name: reservations.guestName })
    .from(reservations).where(eq(reservations.restaurantId, restaurantId));
  const live = rows.filter((r) => r.status === "pending" || r.status === "confirmed");
  const clashes: string[] = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const A = live[i], B = live[j];
    if (A.date !== B.date) continue;
    if (!(mins(A.time) < mins(B.time) + TURN && mins(B.time) < mins(A.time) + TURN)) continue;
    if (parse(A.a).some((t) => parse(B.a).includes(t))) clashes.push(`${A.name} ↔ ${B.name}`);
  }
  ok(clashes.length === 0, `${label}: no two overlapping bookings share a table${clashes.length ? " — " + clashes.join("; ") : ""}`);
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);

  const [pl] = await db.insert(places).values({ name: "DelSafe", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "DelSafe", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: TURN, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 12 });

  const T: Record<string, string> = {};
  for (const l of ["M1", "M2", "M3"]) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r.id, label: l, seats: 4, joinable: true }).returning({ id: reservationTables.id });
    T[l] = t.id;
  }
  const labelOf = (id: string) => Object.keys(T).find((k) => T[k] === id) ?? "?";
  const base = { restaurantId: r.id, date, guestPhone: "0700000000", status: "confirmed" as const };
  const [b1] = await db.insert(reservations).values({ ...base, time: "19:00", partySize: 4, guestName: "Client M1", assignedTableIds: JSON.stringify([T.M1]) }).returning({ id: reservations.id });
  await db.insert(reservations).values({ ...base, time: "19:00", partySize: 4, guestName: "Client M2", assignedTableIds: JSON.stringify([T.M2]) });

  sec("1. The guard detects future guests seated at the table");
  ok((await bookingsSeatedAtTable(r.id, T.M1)).length === 1, "M1 reports its 1 future booking → plain delete is refused (409)");
  ok((await bookingsSeatedAtTable(r.id, T.M3)).length === 0, "M3 (empty) reports none → deletes without a prompt");

  sec("2. Confirmed delete re-seats the guest instead of stranding them");
  const rep = await forceDeleteTable(r.id, T.M1);
  ok(rep.assigned === 1 && rep.unassigned.length === 0, `the guest was moved to a free table — assigned=${rep.assigned}, stranded=${rep.unassigned.length}`);
  const moved = parse((await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.id, b1.id)))[0].a);
  ok(moved.length === 1 && moved[0] === T.M3, `…specifically onto the free table M3 — got ${moved.map(labelOf).join("+")}`);
  const board = await listUpcomingReservations(r.id);
  ok(board.every((b) => !(b.tables ?? []).includes("?")), "no booking shows a '?' table on the board any more");
  await assertNoDoubleBooking(r.id, "after deleting an occupied table");

  sec("3. Deactivating is the safe alternative (booking keeps its table)");
  await db.update(reservationTables).set({ isActive: false }).where(eq(reservationTables.id, T.M2));
  const keep = parse((await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.guestName, "Client M2")))[0].a);
  ok(keep[0] === T.M2, "the booking still holds the deactivated table");
  ok((await listUpcomingReservations(r.id)).find((b) => b.guestName === "Client M2")?.tables?.[0] === "M2", "…and the board still shows its label (no '?')");
  ok(!(await availableSlotsForDay(r.id, date, 4)).includes("19:00"), "nobody else can take that slot (M3 taken, M2 inactive)");
  await db.update(reservationTables).set({ isActive: true }).where(eq(reservationTables.id, T.M2));

  sec("4. Deleting the LAST table: no double-booking, everyone reported");
  await forceDeleteTable(r.id, T.M2);
  const last = await forceDeleteTable(r.id, T.M3);
  ok(last.assigned === 0 && last.unassigned.length === 2, `both bookings reported as un-seatable — got ${last.unassigned.length}`);
  ok((await db.select().from(reservationTables).where(eq(reservationTables.restaurantId, r.id))).length === 0, "no tables left");
  ok((await availableSlotsForDay(r.id, date, 2)).length === 0, "no slots offered at all → impossible to double-book");
  ok((await listUpcomingReservations(r.id)).length === 2, "the two existing bookings still exist on the board (nothing deleted)");
  await assertNoDoubleBooking(r.id, "after deleting every table");

  // ── Seats mode: deleting an INTERVAL ────────────────────────────────────────
  sec("5. Seats mode — deleting an interval doesn't touch existing bookings");
  await db.update(restaurants).set({ reservationCapacityMode: "seats" }).where(eq(restaurants.id, r.id));
  const [h] = await db.select({ id: reservationHours.id }).from(reservationHours).where(eq(reservationHours.restaurantId, r.id));
  ok((await availableSlotsForDay(r.id, date, 2)).includes("19:30"), "before: the interval offers slots");
  await db.delete(reservationHours).where(eq(reservationHours.id, h.id));
  const after = await db.select({ time: reservations.time, partySize: reservations.partySize, status: reservations.status }).from(reservations).where(eq(reservations.restaurantId, r.id));
  ok(after.length === 2 && after.every((x) => x.status === "confirmed" && x.time === "19:00" && x.partySize === 4), "existing bookings keep time/party/status — untouched");
  ok((await listUpcomingReservations(r.id)).length === 2, "…and still show on the board");
  ok((await availableSlotsForDay(r.id, date, 2)).length === 0, "only FUTURE availability is gone (no slots offered)");

  // ── Deleting a GROUP that a future booking was seated through ───────────────
  sec("6. Deleting a join-GROUP used by a future booking");
  await cleanup();
  const [pl2] = await db.insert(places).values({ name: "DelGrp", description: "t", slug: `${P}p2`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r2] = await db.insert(restaurants).values({
    name: "DelGrp", slug: `${P}r2`, placeId: pl2.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    // maxJoin 1 → WITHOUT a group nothing can be joined, so the group is the only way
    // a 7-person party can be seated. That isolates the group's effect.
    reservationCapacityMode: "tables", reservationTurnMinutes: TURN, reservationMaxJoin: 1, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r2.id, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 12 });
  const [g1] = await db.insert(reservationTables).values({ restaurantId: r2.id, label: "Masa 1", seats: 3, joinable: true }).returning({ id: reservationTables.id });
  const [g2] = await db.insert(reservationTables).values({ restaurantId: r2.id, label: "Masa 2", seats: 4, joinable: true }).returning({ id: reservationTables.id });
  const [grp] = await db.insert(reservationTableGroups).values({ restaurantId: r2.id, label: "Masa 1–2" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values([{ groupId: grp.id, tableId: g1.id }, { groupId: grp.id, tableId: g2.id }]);

  // A 7-person party seated through the group (3 + 4).
  await db.insert(reservations).values({
    restaurantId: r2.id, date, time: "19:00", partySize: 7, guestName: "Grup 7p", guestPhone: "0700000000",
    status: "confirmed", assignedTableIds: JSON.stringify([g1.id, g2.id]),
  });
  ok((await availableSlotsForDay(r2.id, date, 7)).includes("21:00"), "before: a party of 7 can be seated at a free hour (via the group)");

  // Owner deletes the group (members cascade).
  await db.delete(reservationTableGroupMembers).where(eq(reservationTableGroupMembers.groupId, grp.id));
  await db.delete(reservationTableGroups).where(eq(reservationTableGroups.id, grp.id));

  const stillHeld = parse((await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.restaurantId, r2.id)))[0].a);
  ok(stillHeld.length === 2 && stillHeld.includes(g1.id) && stillHeld.includes(g2.id), "the existing booking STILL holds both tables (the group was only a rule)");
  const b = (await listUpcomingReservations(r2.id))[0];
  ok((b.tables ?? []).join("+") === "Masa 1+Masa 2", `the board still shows both labels, no '?' — got ${(b.tables ?? []).join("+")}`);
  ok(!(await availableSlotsForDay(r2.id, date, 3)).includes("19:00"), "its tables are still occupied — nobody can take them at 19:00");
  await assertNoDoubleBooking(r2.id, "after deleting the group");

  ok(!(await availableSlotsForDay(r2.id, date, 7)).includes("21:00"), "FUTURE only: a new party of 7 can no longer be joined (no group, maxJoin=1)");
  ok((await availableSlotsForDay(r2.id, date, 3)).includes("21:00"), "…smaller parties that fit a single table are unaffected");

  sec("7. Deleting a TABLE that belongs to a group");
  const [grp2] = await db.insert(reservationTableGroups).values({ restaurantId: r2.id, label: "Refăcut" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values([{ groupId: grp2.id, tableId: g1.id }, { groupId: grp2.id, tableId: g2.id }]);
  await forceDeleteTable(r2.id, g2.id); // cascade removes its membership
  const groupsNow = await getReservationTableGroups(r2.id);
  ok(groupsNow.length === 1 && groupsNow[0].tableIds.length === 1, `the group survives with its remaining member (${groupsNow[0]?.tableIds.length} left) — no crash`);
  ok(!(await availableSlotsForDay(r2.id, date, 7)).includes("21:00"), "a 1-member group can't seat an oversized party (nothing to join)");
  ok((await availableSlotsForDay(r2.id, date, 3)).includes("21:00"), "the remaining table still works normally");
  await assertNoDoubleBooking(r2.id, "after deleting a grouped table");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
