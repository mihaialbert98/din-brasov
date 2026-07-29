/**
 * Switching "capacitate totală" → "mese individuale" must not oversell. Bookings made
 * in seats mode hold no table, so before the fix they occupied nothing and the whole
 * table inventory looked free (15 people booked, yet all 20 seats bookable again).
 * backfillTableAssignments() attaches real tables to those future bookings — without
 * touching their date / time / party / status — and reports the ones that don't fit.
 * Throwaway restaurant (slug modesw-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-mode-switch.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, backfillTableAssignments, listUpcomingReservations } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "modesw-";
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10); }
  return "";
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);

  // SEATS mode: 20 covers per slot, turn 90.
  const [pl] = await db.insert(places).values({ name: "ModeSw", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "ModeSw", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });

  // 15 people booked at 19:00 in seats mode (no table assigned), + one oversized party.
  const base = { restaurantId: r.id, date, guestPhone: "0700000000", status: "confirmed" as const };
  await db.insert(reservations).values([
    { ...base, time: "19:00", partySize: 8, guestName: "Grup A" },
    { ...base, time: "19:00", partySize: 7, guestName: "Grup B" },
    // Later slot (no overlap with the 19:00 turn window). 9 people > any table or join
    // of 2 x 4 seats → this one can't be seated in tables mode.
    { ...base, time: "21:30", partySize: 9, guestName: "Grup XXL" },
  ]);

  sec("1. Seats mode respects the 20-cover pool");
  ok((await availableSlotsForDay(r.id, date, 5)).includes("19:00"), "party 5 fits (15+5 = 20)");
  ok(!(await availableSlotsForDay(r.id, date, 6)).includes("19:00"), "party 6 refused (15+6 > 20)");

  // Owner switches to TABLES mode: 5 tables x 4 seats (maxJoin 2 → max join = 8).
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r.id));
  for (const l of ["M1", "M2", "M3", "M4", "M5"]) {
    await db.insert(reservationTables).values({ restaurantId: r.id, label: l, seats: 4, joinable: true });
  }

  sec("2. Backfill attaches tables to the existing bookings");
  const report = await backfillTableAssignments(r.id);
  ok(report.assigned === 2, `2 bookings got tables (8p → M+M, 7p → M+M) — got ${report.assigned}`);
  ok(report.unassigned.length === 1 && report.unassigned[0].guestName === "Grup XXL", `the 9-person party is reported as not fitting — got ${report.unassigned.map((u) => u.guestName).join(",") || "none"}`);

  sec("3. No oversell — the seated guests now hold their tables");
  // 4 tables are taken by the 8p + 7p bookings (2 each); only M5 is free at 19:00.
  ok((await availableSlotsForDay(r.id, date, 4)).includes("19:00"), "party 4 still fits (the one free table)");
  ok(!(await availableSlotsForDay(r.id, date, 5)).includes("19:00"), "party 5 refused at 19:00 — the rest of the room is genuinely taken");

  sec("4. Existing bookings themselves are untouched");
  const rows = await db.select({ time: reservations.time, partySize: reservations.partySize, status: reservations.status, guestName: reservations.guestName, a: reservations.assignedTableIds })
    .from(reservations).where(eq(reservations.restaurantId, r.id));
  const a = rows.find((x) => x.guestName === "Grup A")!;
  ok(a.time === "19:00" && a.partySize === 8 && a.status === "confirmed", "date/time/party/status unchanged — only a table was attached");
  ok(JSON.parse(a.a ?? "[]").length === 2, "…and it now holds 2 tables (8 people over 4-seat tables)");
  const xxl = rows.find((x) => x.guestName === "Grup XXL")!;
  ok(xxl.a === null && xxl.status === "confirmed", "the party that didn't fit keeps its booking (still confirmed, no table)");
  const board = await listUpcomingReservations(r.id);
  ok(board.length === 3, "all three bookings still show on the board");

  sec("5. Re-running is safe (idempotent)");
  const again = await backfillTableAssignments(r.id);
  ok(again.assigned === 0 && again.unassigned.length === 1, "already-assigned bookings are skipped; the unfitting one is re-reported");

  // ── The REVERSE switch: mese individuale → capacitate totală ────────────────
  sec("6. Switching BACK to seats mode — table-mode bookings still consume capacity");
  await db.update(restaurants).set({ reservationCapacityMode: "seats" }).where(eq(restaurants.id, r.id));
  // At 19:00 the two carried-over bookings hold 15 people; the pool is 20.
  ok((await availableSlotsForDay(r.id, date, 5)).includes("19:00"), "party 5 fits (15 booked + 5 = 20) — the tables-mode bookings DO count against the seat pool");
  ok(!(await availableSlotsForDay(r.id, date, 6)).includes("19:00"), "party 6 refused (15 + 6 > 20) — no oversell in this direction either");

  sec("7. Bookings survive the round-trip untouched");
  const back = await db.select({ time: reservations.time, partySize: reservations.partySize, status: reservations.status, guestName: reservations.guestName, a: reservations.assignedTableIds })
    .from(reservations).where(eq(reservations.restaurantId, r.id));
  const aBack = back.find((x) => x.guestName === "Grup A")!;
  ok(aBack.time === "19:00" && aBack.partySize === 8 && aBack.status === "confirmed", "date/time/party/status unchanged after switching back");
  ok(JSON.parse(aBack.a ?? "[]").length === 2, "its table assignment is KEPT (ignored in seats mode, reused if you switch back)");
  ok((await listUpcomingReservations(r.id)).length === 3, "all bookings still on the board");

  // Switch to tables once more: the kept assignments mean occupancy is instantly right.
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r.id));
  ok(!(await availableSlotsForDay(r.id, date, 5)).includes("19:00"), "back in tables mode → occupancy still correct (assignments were preserved)");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
