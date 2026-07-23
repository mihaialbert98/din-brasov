/**
 * Join-groups: tables combine only within a declared group (up to the whole group),
 * ungrouped joinables keep the global maxJoin, a table may be in multiple groups, and
 * occupancy is per-table. Pure canSeat unit checks + a DB-backed occupancy check.
 * Throwaway restaurant (slug joingrp-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-join-groups.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { canSeat, availableSlotsForDay, assignTablesFor, type ResTable, type TableGroup } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const T = (id: string, seats: number, joinable = false): ResTable => ({ id, label: id, seats, joinable, area: null });
const G = (id: string, tableIds: string[]): TableGroup => ({ id, label: id, tableIds });
const ids = (r: string[] | null) => (r ? [...r].sort().join(",") : "null");
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "joingrp-%"));
  const rids = r.map((x) => x.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    const grp = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    if (grp.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, grp.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, "joingrp-%"));
}

async function main() {
  await cleanup();

  // ── Pure canSeat unit checks ──────────────────────────────────────────────
  sec("1. Group joins (pure canSeat)");
  const g1 = G("G1", ["M1", "M2"]);
  const g2 = G("G2", ["M6", "M7", "M8"]);

  ok(ids(canSeat(4, [T("M1", 2, true), T("M2", 2, true)], 2, [g1])) === "M1,M2", "party 4 joins M1+M2 within G1");
  ok(canSeat(5, [T("M1", 2, true), T("M2", 2, true)], 2, [g1]) === null, "party 5 in G1 (2+2) → null");
  ok(canSeat(4, [T("M1", 2, true), T("M6", 2, true)], 2, [g1, g2]) === null, "Masa 1 never joins Masa 6 (cross-group blocked)");
  ok(canSeat(4, [T("M1", 2, true), T("M2", 2, false)], 2, [g1]) === null, "master switch: non-joinable group member (M2) is not combined → null");

  sec("2. Group size beats global maxJoin");
  const three = canSeat(6, [T("M6", 2, true), T("M7", 2, true), T("M8", 2, true)], 2, [g2]);
  ok(three !== null && three.length === 3, "party 6 → joins all three M6+M7+M8 even though maxJoin=2");

  sec("3. Partial-group occupancy (pure)");
  // Only M8 free in G2 (M6, M7 busy → absent from `free`).
  ok(ids(canSeat(2, [T("M8", 2, true)], 2, [g2])) === "M8", "party 2 → free M8 offered on its own");
  ok(canSeat(4, [T("M8", 2, true)], 2, [g2]) === null, "party 4 → only M8 free in G2 → null");

  sec("4. Multi-group table");
  // M2 ∈ G1 and G3={M2,M8}. M1 busy (absent). Party 4 → G3 joins M2+M8.
  const g3 = G("G3", ["M2", "M8"]);
  ok(ids(canSeat(4, [T("M2", 2, true), T("M8", 2, true)], 2, [g1, g3])) === "M2,M8", "party 4 seated via G3 (M2+M8) when G1's M1 is busy");

  sec("5. Ungrouped loose pool (back-compat)");
  ok(ids(canSeat(4, [T("X", 2, true), T("Y", 2, true)], 2, [])) === "X,Y", "no groups → joinable X+Y under global maxJoin");
  ok(canSeat(4, [T("X", 2, true), T("Y", 2, true)], 1, []) === null, "maxJoin=1 caps the loose pool");
  ok(canSeat(4, [T("X", 2, false), T("Y", 2, false)], 2, []) === null, "non-joinable ungrouped tables don't combine");
  // Grouped tables are NOT in the loose pool: X grouped alone can't loose-join Y.
  ok(canSeat(4, [T("X", 2, true), T("Y", 2, true)], 2, [G("solo", ["X"])]) === null, "a grouped table can't loose-join an ungrouped one");

  sec("6. Single fit preferred (least waste)");
  ok(ids(canSeat(2, [T("M1", 2), T("BIG", 6)], 2, [G("g", ["M1", "BIG"])])) === "M1", "party 2 → smallest single (M1), no join");

  // ── DB-backed: group loaded from DB + occupancy via availableSlotsForDay ───
  sec("7. DB-backed occupancy (G2 = M6,M7,M8)");
  const dow = 4, date = dateForDow(dow);
  const [pl] = await db.insert(places).values({ name: "JoinGrp", description: "t", slug: "joingrp-p", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "JoinGrp", slug: "joingrp-r", placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 0 });
  const tIds: Record<string, string> = {};
  for (const label of ["M6", "M7", "M8"]) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r.id, label, seats: 2, joinable: true }).returning({ id: reservationTables.id });
    tIds[label] = t.id;
  }
  const [grp] = await db.insert(reservationTableGroups).values({ restaurantId: r.id, label: "G2" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values(["M6", "M7", "M8"].map((l) => ({ groupId: grp.id, tableId: tIds[l] })));

  const a6 = await assignTablesFor(r.id, date, "19:00", 6);
  ok(a6 !== null && a6.length === 3, "empty: party 6 assigns all three group tables (via DB)");

  // Occupy M6+M7 at 19:00 (turn 90 → busy 19:00–20:30).
  await db.insert(reservations).values({ restaurantId: r.id, date, time: "19:00", partySize: 4, guestName: "x", guestPhone: "0700", status: "confirmed", assignedTableIds: JSON.stringify([tIds.M6, tIds.M7]) });
  ok(!(await availableSlotsForDay(r.id, date, 4)).includes("19:00"), "with M6+M7 taken → party 4 can't be seated at 19:00");
  ok((await availableSlotsForDay(r.id, date, 2)).includes("19:00"), "…but the free M8 still seats a party of 2 at 19:00");
  ok((await availableSlotsForDay(r.id, date, 4)).includes("20:30"), "party 4 opens again at 20:30 (turn ended)");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
