/**
 * Table-based reservation capacity test (DEV DB, idempotent).
 * Verifies the tables-mode availability + assignment: single-fit, joining, maxJoin,
 * sliding-window release, area isolation, assignment persistence, and force override.
 *
 * Run: pnpm tsx scripts/test-table-capacity.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { restaurants, places, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { canSeat, availableSlotsForDay, validateBooking, assignTablesFor, createManualReservation, type ResTable } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); const s = t.toISOString().slice(0, 10); if (new Date(s + "T00:00:00").getDay() === dow) return s; }
  return d.toISOString().slice(0, 10);
}
const T = (id: string, seats: number, joinable = false, area: string | null = null): ResTable => ({ id, label: id, seats, joinable, area });

async function cleanup() {
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "tblcap-%"));
  const rids = r.map((x) => x.id);
  const p = await db.select({ id: places.id }).from(places).where(like(places.slug, "tblcap-%"));
  const pids = p.map((x) => x.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  if (pids.length) await db.delete(places).where(inArray(places.id, pids));
}

async function main() {
  await cleanup();

  // ── Pure canSeat unit checks (no DB) ──────────────────────────────────────
  sec("1. canSeat policy (pure)");
  ok(JSON.stringify(canSeat(2, [T("a", 2), T("b", 4)], 2)) === JSON.stringify(["a"]), "party 2 → smallest fit (2-top)");
  ok(JSON.stringify(canSeat(2, [T("b", 4), T("c", 6)], 2)) === JSON.stringify(["b"]), "party 2, no 2-top → takes the 4-top (never refused)");
  ok(canSeat(5, [T("a", 2), T("b", 4)], 2) === null, "party 5, tables 2+4 not joinable → no fit");
  const j = canSeat(7, [T("a", 4, true), T("b", 4, true), T("c", 2, true)], 2);
  ok(j !== null && j.length === 2, "party 7, joinable 4+4+2 → joins two largest (4+4=8)");
  ok(canSeat(9, [T("a", 4, true), T("b", 4, true)], 2) === null, "party 9, joinable 4+4=8 < 9 → no fit");
  ok(canSeat(10, [T("a", 4, true), T("b", 4, true), T("c", 4, true)], 2) === null, "maxJoin 2 blocks 3-table join (4+4+4)");
  ok(canSeat(10, [T("a", 4, true), T("b", 4, true), T("c", 4, true)], 3) !== null, "maxJoin 3 allows the 3-table join");

  // ── DB-backed availability + assignment ───────────────────────────────────
  const dow = 4, date = dateForDow(dow);
  const [pl] = await db.insert(places).values({ name: "TblCap", description: "t", slug: "tblcap-p", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "TblCap", slug: "tblcap-r", placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 0 });
  // Tables: two 2-tops (joinable), one 4-top, one 6-top.
  const [t2a] = await db.insert(reservationTables).values({ restaurantId: r.id, label: "M1", seats: 2, joinable: true }).returning({ id: reservationTables.id });
  const [t2b] = await db.insert(reservationTables).values({ restaurantId: r.id, label: "M2", seats: 2, joinable: true }).returning({ id: reservationTables.id });
  await db.insert(reservationTables).values({ restaurantId: r.id, label: "M3", seats: 4, joinable: false });
  await db.insert(reservationTables).values({ restaurantId: r.id, label: "M4", seats: 6, joinable: false });

  sec("2. Tables-mode availability (empty)");
  ok((await availableSlotsForDay(r.id, date, 4)).includes("19:00"), "party 4 fits (4-top) at 19:00");
  ok((await availableSlotsForDay(r.id, date, 6)).includes("19:00"), "party 6 fits (6-top)");
  ok(!(await availableSlotsForDay(r.id, date, 7)).includes("19:00"), "party 7 does NOT fit (no single ≥7; joinables only 2+2=4)");

  sec("3. Booking assigns a table; overlap can't reuse it");
  // Book the 6-top with a party of 6 at 19:00 (turn 90 → busy 19:00–20:30).
  const v6 = await validateBooking(r.id, date, "19:00", 6);
  ok(v6.ok && !!v6.assignedTableIds && v6.assignedTableIds.length === 1, "validateBooking(6) assigns the 6-top");
  await db.insert(reservations).values({ restaurantId: r.id, date, time: "19:00", partySize: 6, guestName: "Six", guestPhone: "0700", status: "confirmed", assignedTableIds: JSON.stringify(v6.assignedTableIds) });
  ok(!(await availableSlotsForDay(r.id, date, 6)).some((s) => ["19:00", "19:30", "20:00"].includes(s)), "6-top busy across its window → no party-6 slot 19:00–20:00");
  ok((await availableSlotsForDay(r.id, date, 6)).includes("20:30"), "6-top frees at 20:30 (turn ended)");
  ok((await availableSlotsForDay(r.id, date, 4)).includes("19:00"), "party 4 still fits at 19:00 (4-top free)");

  sec("4. Joining two 2-tops for a party of 4 when bigger tables are taken");
  // Occupy the 4-top and 6-top at 19:00; a party of 4 should JOIN the two 2-tops.
  await db.insert(reservations).values({ restaurantId: r.id, date, time: "19:00", partySize: 3, guestName: "Four", guestPhone: "0700", status: "confirmed",
    assignedTableIds: JSON.stringify((await assignTablesFor(r.id, date, "19:00", 3))!) }); // takes the 4-top (smallest fit ≥3)
  const a4 = await assignTablesFor(r.id, date, "19:00", 4);
  ok(a4 !== null && a4.length === 2 && a4.includes(t2a.id) && a4.includes(t2b.id), "party 4 joins M1+M2 (2+2) when 4- and 6-tops are busy");
  const a5 = await assignTablesFor(r.id, date, "19:00", 5);
  ok(a5 === null, "party 5 can't be seated (only 2+2=4 joinable free)");

  sec("5. Force override books even without a free table");
  const forced = await createManualReservation(r.id, { date, time: "19:00", partySize: 8, guestName: "Big", guestPhone: "0700" }, true);
  ok(forced.ok, "staff force-override books a party of 8 with no table available");

  sec("6. Area isolation");
  await db.delete(reservations).where(eq(reservations.restaurantId, r.id));
  await db.update(restaurants).set({ reservationAreasEnabled: true }).where(eq(restaurants.id, r.id));
  await db.update(reservationTables).set({ area: "inside" }).where(eq(reservationTables.restaurantId, r.id));
  const [terasa] = await db.insert(reservationTables).values({ restaurantId: r.id, label: "T1", seats: 4, joinable: false, area: "outside" }).returning({ id: reservationTables.id });
  ok((await availableSlotsForDay(r.id, date, 4, "outside")).includes("19:00"), "terasă party 4 fits (T1)");
  // Book the only terasă table; interior still fine.
  await db.insert(reservations).values({ restaurantId: r.id, date, time: "19:00", partySize: 4, guestName: "Out", guestPhone: "0700", area: "outside", status: "confirmed", assignedTableIds: JSON.stringify([terasa.id]) });
  ok(!(await availableSlotsForDay(r.id, date, 4, "outside")).includes("19:00"), "terasă now full at 19:00");
  ok((await availableSlotsForDay(r.id, date, 4, "inside")).includes("19:00"), "interior still open at 19:00 (independent)");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
