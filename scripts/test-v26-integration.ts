/**
 * INTEGRATION: the v0.26.0 features (per-party duration, closed dates, tables held
 * back for walk-ins) against the v0.24/v0.25 features they have to live with —
 * table delete/add, join-group delete, capacity-mode switching, zone toggling and
 * paused intervals.
 *
 * The danger these guard against is a PHYSICAL double-booking: a repair path that
 * re-seats a booking using a duration recomputed from the current settings rather
 * than the one the booking actually holds, freeing a table while guests are still
 * at it. Every section ends by checking the same invariant — no two bookings that
 * share a table overlap in time, using each booking's own stored duration.
 *
 * Replicates the API routes' logic exactly (they need a session, so the handlers
 * themselves can't be called here); each helper is annotated with the route it mirrors.
 *
 * Throwaway restaurants (slug v26int-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-v26-integration.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers, reservationClosures } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  availabilityForDay, validateBooking, assignTablesFor, createManualReservation, updateReservation,
  backfillTableAssignments, bookingsSeatedAtTable, getReservationTables, getReservationConfig, turnFor,
} from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "v26int-";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

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
    const gs = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    if (gs.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, gs.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(reservationClosures).where(inArray(reservationClosures.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function makeRestaurant(key: string, mode: "seats" | "tables", dow: number, opts: Partial<{ seats: number; longFrom: number; longMinutes: number; longOn: boolean; maxJoin: number; areas: boolean }> = {}) {
  const [pl] = await db.insert(places).values({ name: `V26 ${key}`, description: "t", slug: `${P}${key}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `V26 ${key}`, slug: `${P}${key}`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: mode, reservationTurnMinutes: 90, reservationMaxPartySize: 20,
    reservationMaxJoin: opts.maxJoin ?? 2, reservationAreasEnabled: opts.areas ?? false,
    reservationLongTurnEnabled: opts.longOn ?? true,
    reservationLongTurnFromParty: opts.longFrom ?? 5,
    reservationLongTurnMinutes: opts.longMinutes ?? 120,
    reservationAllowReducedTurn: true,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({
    restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30,
    seatsPerSlot: opts.seats ?? 20,
    seatsInside: opts.areas ? Math.ceil((opts.seats ?? 20) / 2) : null,
    seatsOutside: opts.areas ? Math.floor((opts.seats ?? 20) / 2) : null,
  });
  return r.id;
}

async function addTable(rid: string, label: string, seats: number, joinable = false, area: string | null = null, bookableOnline = true) {
  const [t] = await db.insert(reservationTables).values({ restaurantId: rid, label, seats, joinable, area, bookableOnline }).returning({ id: reservationTables.id });
  return t.id;
}

async function book(rid: string, date: string, time: string, partySize: number, turnMinutes: number | null, tableIds: string[] | null, area: string | null = null, name = "T") {
  const [row] = await db.insert(reservations).values({
    restaurantId: rid, date, time, partySize, guestName: name, guestPhone: "0700000000",
    status: "confirmed", turnMinutes, area, assignedTableIds: tableIds ? JSON.stringify(tableIds) : null,
  }).returning({ id: reservations.id });
  return row.id;
}

/** Mirrors DELETE /reservation-tables: clear the affected bookings, drop the table, backfill. */
async function deleteTableLikeRoute(rid: string, tableId: string) {
  const affected = await bookingsSeatedAtTable(rid, tableId);
  if (affected.length > 0) {
    await db.update(reservations).set({ assignedTableIds: null, updatedAt: new Date() }).where(inArray(reservations.id, affected.map((b) => b.id)));
  }
  await db.delete(reservationTables).where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, rid)));
  return backfillTableAssignments(rid);
}

/** Mirrors PATCH /reservations-settings for capacityMode (incl. the seats→tables backfill). */
async function setCapacityMode(rid: string, mode: "seats" | "tables") {
  const [before] = await db.select({ m: restaurants.reservationCapacityMode }).from(restaurants).where(eq(restaurants.id, rid));
  await db.update(restaurants).set({ reservationCapacityMode: mode, updatedAt: new Date() }).where(eq(restaurants.id, rid));
  if (mode === "tables" && before.m !== "tables") return backfillTableAssignments(rid);
  return null;
}

/** Mirrors PATCH /reservations-settings for areasEnabled (tables mode parks the terrace). */
async function setAreas(rid: string, on: boolean) {
  const [r] = await db.select({ m: restaurants.reservationCapacityMode }).from(restaurants).where(eq(restaurants.id, rid));
  await db.update(restaurants).set({ reservationAreasEnabled: on, updatedAt: new Date() }).where(eq(restaurants.id, rid));
  if (r.m === "tables") {
    await db.update(reservationTables).set({ isActive: on }).where(and(eq(reservationTables.restaurantId, rid), eq(reservationTables.area, "outside")));
  }
}

/** THE invariant: no two bookings sharing a table overlap, per their OWN durations. */
async function assertNoClashes(rid: string, label: string) {
  const cfg = await getReservationConfig(rid);
  const rows = await db
    .select({ id: reservations.id, date: reservations.date, time: reservations.time, turnMinutes: reservations.turnMinutes, assignedTableIds: reservations.assignedTableIds, guestName: reservations.guestName })
    .from(reservations)
    .where(and(eq(reservations.restaurantId, rid), inArray(reservations.status, ["pending", "confirmed"])));
  let clashes = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.date !== b.date) continue;
      const aT: string[] = JSON.parse(a.assignedTableIds ?? "[]");
      const bT: string[] = JSON.parse(b.assignedTableIds ?? "[]");
      if (!aT.some((t) => bT.includes(t))) continue;
      const aS = toMin(a.time), aE = aS + (a.turnMinutes ?? cfg.turn);
      const bS = toMin(b.time), bE = bS + (b.turnMinutes ?? cfg.turn);
      if (aS < bE && bS < aE) {
        clashes++;
        console.log(`    ✗ CLASH: ${a.guestName} ${a.time}(+${a.turnMinutes}) vs ${b.guestName} ${b.time}(+${b.turnMinutes})`);
      }
    }
  }
  ok(clashes === 0, `${label} — no two bookings sharing a table overlap (${rows.length} bookings)`);
}

async function main() {
  await cleanup();
  const dow = 3, date = dateForDow(dow);

  // ── 1. THE REGRESSION: delete a table after the duration rule changed ────────
  sec("1. Deleting a table re-seats bookings for the duration THEY hold");
  {
    const r = await makeRestaurant("del", "tables", dow);
    const m1 = await addTable(r, "M1", 6);
    const m2 = await addTable(r, "M2", 6);
    // A holds M1 for 2h (booked while the large-party rule was on).
    const a = await book(r, date, "19:00", 6, 120, [m1], null, "A-lung");
    // B holds M2 from 20:30 — it starts INSIDE A's real window.
    await book(r, date, "20:30", 4, 90, [m2], null, "B");

    // The owner now switches the large-party rule OFF. A's stored duration must win:
    // recomputing from the party size would say 90 min and free M2 wrongly.
    await db.update(restaurants).set({ reservationLongTurnEnabled: false }).where(eq(restaurants.id, r));
    const cfg = await getReservationConfig(r);
    ok(turnFor(6, cfg) === 90, "with the rule off, the CURRENT rule would give this party only 90 min");

    const report = await deleteTableLikeRoute(r, m1);
    const [aRow] = await db.select({ turnMinutes: reservations.turnMinutes, assignedTableIds: reservations.assignedTableIds }).from(reservations).where(eq(reservations.id, a));
    ok(aRow.turnMinutes === 120, "the booking KEEPS its stored 120-min duration through the repair");
    ok(report.unassigned.length === 1, "…and it is reported as un-seatable rather than squeezed onto M2");
    ok(!JSON.parse(aRow.assignedTableIds ?? "[]").includes(m2), "it was NOT placed on M2, which is busy from 20:30");
    await assertNoClashes(r, "after deleting a table");
  }

  // ── 2. Delete where the booking legitimately fits ────────────────────────────
  sec("2. …but a booking that genuinely fits IS re-seated");
  {
    const r = await makeRestaurant("del2", "tables", dow);
    const m1 = await addTable(r, "M1", 6);
    const m2 = await addTable(r, "M2", 6);
    const a = await book(r, date, "19:00", 6, 120, [m1], null, "A-lung");
    await book(r, date, "21:00", 4, 90, [m2], null, "B"); // starts exactly when A ends

    const report = await deleteTableLikeRoute(r, m1);
    const [aRow] = await db.select({ assignedTableIds: reservations.assignedTableIds, turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.id, a));
    ok(report.assigned === 1 && report.unassigned.length === 0, "the booking was re-seated");
    ok(JSON.parse(aRow.assignedTableIds ?? "[]").includes(m2), "…onto M2, free until 21:00 — back-to-back is allowed");
    ok(aRow.turnMinutes === 120, "duration still untouched by the repair");
    await assertNoClashes(r, "after a successful re-seat");
  }

  // ── 3. Deleting a table that was held back for walk-ins ─────────────────────
  sec("3. Deleting a held-back table");
  {
    const r = await makeRestaurant("delheld", "tables", dow);
    const m1 = await addTable(r, "M1", 4);
    const held = await addTable(r, "M5", 6, false, null, false);
    const a = await book(r, date, "19:00", 6, 120, [held], null, "Walk-in");
    const report = await deleteTableLikeRoute(r, held);
    ok(report.unassigned.length === 1, "the booking on it can't be re-seated (M1 seats only 4)");
    const [aRow] = await db.select({ partySize: reservations.partySize, status: reservations.status }).from(reservations).where(eq(reservations.id, a));
    ok(aRow.status === "confirmed" && aRow.partySize === 6, "the booking itself is untouched — the owner is told to call");
    ok((await getReservationTables(r, undefined, "staff")).length === 1, "only M1 remains");
    await assertNoClashes(r, "after deleting the held-back table");
  }

  // ── 4. Adding a table backfills using stored durations ──────────────────────
  sec("4. Adding a table re-seats orphaned bookings at their own duration");
  {
    const r = await makeRestaurant("add", "tables", dow);
    const m1 = await addTable(r, "M1", 6);
    await book(r, date, "20:00", 4, 90, [m1], null, "Ocupa-M1");
    // An orphan (e.g. carried over from seats mode) that holds the table for 2h.
    const orphan = await book(r, date, "19:00", 6, 120, null, null, "Orfan-2h");

    let report = await backfillTableAssignments(r);
    ok(report.unassigned.length === 1, "before adding a table it cannot be seated (M1 busy 20:00–21:30)");

    const m2 = await addTable(r, "M2", 6); // mirrors POST /reservation-tables → backfill
    report = await backfillTableAssignments(r);
    const [oRow] = await db.select({ assignedTableIds: reservations.assignedTableIds, turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.id, orphan));
    ok(report.assigned === 1 && JSON.parse(oRow.assignedTableIds ?? "[]").includes(m2), "after adding M2 it is seated there");
    ok(oRow.turnMinutes === 120, "its 2-hour duration survived the backfill");
    await assertNoClashes(r, "after adding a table");
  }

  // ── 5. Deleting a join-group used by a long booking ─────────────────────────
  sec("5. Deleting a join-group that a large party is using");
  {
    const r = await makeRestaurant("grp", "tables", dow, { maxJoin: 1 });
    const t1 = await addTable(r, "G1", 3, true);
    const t2 = await addTable(r, "G2", 4, true);
    const [g] = await db.insert(reservationTableGroups).values({ restaurantId: r, label: "Salon" }).returning({ id: reservationTableGroups.id });
    await db.insert(reservationTableGroupMembers).values([{ groupId: g.id, tableId: t1 }, { groupId: g.id, tableId: t2 }]);

    const ids = await assignTablesFor(r, date, "19:00", 6, undefined, undefined, { channel: "staff" });
    ok(ids?.length === 2, "a party of 6 is seated by joining G1+G2 through the group");
    const a = await book(r, date, "19:00", 6, 120, ids!, null, "Grup-6");
    ok(!(await availabilityForDay(r, date, 3)).slots.includes("20:00"), "both tables are held for the full 2h — nobody else at 20:00");

    // Mirrors DELETE /reservation-table-groups (cascade removes the members).
    await db.delete(reservationTableGroupMembers).where(eq(reservationTableGroupMembers.groupId, g.id));
    await db.delete(reservationTableGroups).where(eq(reservationTableGroups.id, g.id));

    const [aRow] = await db.select({ assignedTableIds: reservations.assignedTableIds, turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.id, a));
    ok(JSON.parse(aRow.assignedTableIds ?? "[]").length === 2, "the EXISTING booking keeps both tables after the group is deleted");
    ok(aRow.turnMinutes === 120, "…and its duration");
    ok(!(await availabilityForDay(r, date, 3)).slots.includes("20:00"), "…so its tables are still blocked at 20:00 — no double-booking");
    ok((await assignTablesFor(r, date, "21:00", 6, undefined, undefined, { channel: "staff" })) === null, "FUTURE parties of 6 can no longer be joined (group gone, maxJoin=1)");
    await assertNoClashes(r, "after deleting a group");
  }

  // ── 6. Capacity-mode switch with mixed durations ────────────────────────────
  sec("6. Switching capacitate totală → mese individuale with mixed durations");
  {
    const r = await makeRestaurant("mode", "seats", dow, { seats: 12 });
    await addTable(r, "M1", 6);
    await addTable(r, "M2", 6);
    // Booked in seats mode: one long (2h), one standard.
    const long = await book(r, date, "19:00", 6, 120, null, null, "Lung-2h");
    await book(r, date, "20:30", 4, 90, null, null, "Scurt");

    const report = await setCapacityMode(r, "tables");
    ok(report?.assigned === 2, "both seats-mode bookings got real tables");
    const [lRow] = await db.select({ turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.id, long));
    ok(lRow.turnMinutes === 120, "the long booking kept its 2h duration across the switch");
    await assertNoClashes(r, "after seats → tables");

    // The 2h booking must still block its table at 20:30 (a 90-min read would free it).
    ok(!(await availabilityForDay(r, date, 6)).slots.includes("20:30"), "no party of 6 at 20:30 — the 2h booking still holds its table");

    // …and back again. At 20:30 both bookings overlap (the 2h one runs to 21:00), so
    // 10 of the 12 covers are taken: a party of 2 fills the room exactly, 3 does not fit.
    await setCapacityMode(r, "seats");
    ok((await availabilityForDay(r, date, 2)).slots.includes("20:30"), "back in seats mode a party of 2 fits at 20:30 (10 + 2 = 12, exactly full)");
    ok(!(await availabilityForDay(r, date, 3)).slots.includes("20:30"), "…but a party of 3 does NOT (10 + 3 > 12) — the 2h booking still counts");
    await assertNoClashes(r, "after tables → seats → (assignments preserved)");
  }

  // ── 7. Zone toggle vs held-back tables ──────────────────────────────────────
  sec("7. Turning zones off/on preserves the walk-in hold");
  {
    const r = await makeRestaurant("zone", "tables", dow, { areas: true });
    const inside = await addTable(r, "I1", 4, false, "inside");
    const outHeld = await addTable(r, "T1", 4, false, "outside", false); // terrace, held back
    const outFree = await addTable(r, "T2", 4, false, "outside", true);

    ok((await getReservationTables(r, "outside")).length === 1, "online sees only the non-held terrace table");
    await setAreas(r, false); // zones off → terrace parked
    ok((await getReservationTables(r, undefined, "staff")).every((t) => t.id === inside), "zones off → both terrace tables are deactivated (staff too)");
    await setAreas(r, true); // zones back on
    const afterStaff = await getReservationTables(r, undefined, "staff");
    const afterOnline = await getReservationTables(r);
    ok(afterStaff.length === 3, "zones back on → all three tables are active again");
    ok(afterOnline.some((t) => t.id === outFree) && !afterOnline.some((t) => t.id === outHeld),
      "…and T1 is STILL held back for walk-ins (the zone round-trip didn't reset it)");
  }

  // ── 8. Closed date vs the repair paths and paused intervals ─────────────────
  sec("8. Closed dates alongside paused intervals and table deletion");
  {
    const r = await makeRestaurant("mix", "tables", dow);
    const m1 = await addTable(r, "M1", 6);
    const m2 = await addTable(r, "M2", 6);
    const a = await book(r, date, "19:00", 6, 120, [m1], null, "Pe zi închisă");
    await db.insert(reservationClosures).values({ restaurantId: r, dateFrom: date, dateTo: date, reason: "Privat" });

    ok((await availabilityForDay(r, date, 2)).slots.length === 0, "closed day offers nothing to clients");
    // Deleting a table on a closed day must still re-seat the guests who are booked.
    const report = await deleteTableLikeRoute(r, m1);
    ok(report.assigned === 1, "the repair still re-seats the booking, even though the day is closed");
    const [aRow] = await db.select({ assignedTableIds: reservations.assignedTableIds, turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.id, a));
    ok(JSON.parse(aRow.assignedTableIds ?? "[]").includes(m2) && aRow.turnMinutes === 120, "…onto M2, keeping its 2h duration");
    await assertNoClashes(r, "closed day + table delete");

    // Pausing the day's only interval on top of the closure changes nothing for clients.
    await db.update(reservationHours).set({ enabled: false }).where(eq(reservationHours.restaurantId, r));
    ok((await availabilityForDay(r, date, 2)).slots.length === 0, "paused + closed → still nothing offered");
    await db.update(reservationHours).set({ enabled: true }).where(eq(reservationHours.restaurantId, r));
    ok((await availabilityForDay(r, date, 2)).slots.length === 0, "un-paused but still closed → still nothing (closure alone holds)");
    await db.delete(reservationClosures).where(eq(reservationClosures.restaurantId, r));
    ok((await availabilityForDay(r, date, 2)).slots.length > 0, "reopened + un-paused → bookable again");
  }

  // ── 9. Staff overrides never corrupt the invariant ──────────────────────────
  sec("9. Forced staff bookings and edits keep durations honest");
  {
    const r = await makeRestaurant("force", "tables", dow);
    const m1 = await addTable(r, "M1", 6);
    await book(r, date, "19:00", 6, 120, [m1], null, "Ocupant");

    // Force a booking into a full slot — allowed, and it must store a real duration.
    const forced = await createManualReservation(r, { date, time: "19:30", partySize: 6, guestName: "Forțat", guestPhone: "0711111111" }, true);
    ok(forced.ok, "staff can force a booking into a full slot");
    const [fRow] = await db.select({ turnMinutes: reservations.turnMinutes, assignedTableIds: reservations.assignedTableIds }).from(reservations).where(eq(reservations.guestName, "Forțat"));
    ok(fRow.turnMinutes === 120, "the forced booking stored the large-party duration");
    ok(fRow.assignedTableIds === null, "…and holds NO table (the room was genuinely full) rather than stealing one");
    await assertNoClashes(r, "after a forced booking");

    // Editing a booking up past the threshold must extend its stored duration.
    const small = await book(r, date + "", "17:00", 2, 90, null, null, "Mic");
    const upd = await updateReservation(r, small, { date, time: "17:00", partySize: 6 }, true);
    ok(upd.ok, "staff grew the party from 2 to 6");
    const [sRow] = await db.select({ turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.id, small));
    ok(sRow.turnMinutes === 120, "…and the stored duration grew from 90 to 120 min");
    await assertNoClashes(r, "after an edit across the threshold");
  }

  // ── 10. Max party size vs the long-turn threshold ───────────────────────────
  sec("10. The public cap still applies above the long-turn threshold");
  {
    const r = await makeRestaurant("cap", "seats", dow, { seats: 40, longFrom: 5 });
    await db.update(restaurants).set({ reservationMaxPartySize: 8 }).where(eq(restaurants.id, r));
    const v6 = await validateBooking(r, date, "19:00", 6);
    ok(v6.ok && v6.turnMinutes === 120, "a party of 6 books fine and gets the long duration");
    const v9 = await validateBooking(r, date, "19:00", 9);
    ok(!v9.ok && /între 1 și 8/.test(v9.reason ?? ""), "a party of 9 is refused by the max-party cap, not by the duration rule");
  }

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
