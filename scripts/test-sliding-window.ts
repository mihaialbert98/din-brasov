/**
 * Sliding-window reservation availability test (DEV DB, idempotent).
 *
 * Proves the fix for the overlap/oversell bug: a booking holds its seats across
 * [start, start + turn), so a later start that overlaps can't reuse the same seats
 * — but availability re-opens once the earlier party's window ends.
 *
 * Run: pnpm tsx scripts/test-sliding-window.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { restaurants, restaurantMembers, users, places, reservations, reservationHours } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, validateBooking, createManualReservation } from "../lib/reservations";

const MARK = "@slide.test";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);

// A future date that lands on a specific weekday (so it matches the hours row).
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (t.getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "slide-%"));
  const rids = r.map((x) => x.id);
  const p = await db.select({ id: places.id }).from(places).where(like(places.slug, "slide-%"));
  const pids = p.map((x) => x.id);
  const u = await db.select({ id: users.id }).from(users).where(like(users.email, `%${MARK}`));
  const uids = u.map((x) => x.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurantMembers).where(inArray(restaurantMembers.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  if (pids.length) await db.delete(places).where(inArray(places.id, pids));
  if (uids.length) await db.delete(users).where(inArray(users.id, uids));
}

async function main() {
  await cleanup();

  const dow = 5; // Friday
  const date = dateForDow(dow);

  // Restaurant with turn=90, single-capacity 20 seats, 15-min grid, 17:00–22:00.
  const [p] = await db.insert(places).values({ name: "Slide Local", description: "Test sliding window.", slug: "slide-local", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "Slide", slug: "slide-rest", placeId: p!.id, showInLocaluri: true, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationTurnMinutes: 90, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r!.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 15, seatsPerSlot: 20 });

  sec("1. 15-min start grid");
  const empty = await availableSlotsForDay(r!.id, date, 2);
  ok(empty.includes("19:00") && empty.includes("19:15") && empty.includes("19:30"), "empty day offers 15-min starts (19:00/19:15/19:30)");

  sec("2. Sliding window blocks overlapping reuse (turn=90)");
  // Book 16 seats at 19:00 → occupies [19:00, 20:30).
  await db.insert(reservations).values({ restaurantId: r!.id, date, time: "19:00", partySize: 16, guestName: "Big", guestPhone: "0700000001", status: "confirmed" });
  const after = await availableSlotsForDay(r!.id, date, 8); // party of 8 → needs 8 of the 4 remaining
  ok(!after.includes("19:00"), "19:00 blocked for party 8 (only 4 seats left)");
  ok(!after.includes("19:15"), "19:15 blocked — overlaps the 19:00 booking's window");
  ok(!after.includes("19:30"), "19:30 blocked — still within [19:00,20:30)");
  ok(!after.includes("20:00"), "20:00 blocked — still overlaps (ends 20:30)");
  ok(!after.includes("20:15"), "20:15 blocked — window covers 20:15");
  ok(after.includes("20:30"), "20:30 OPEN — first party's window ended (this is the fix)");
  ok(after.includes("20:45"), "20:45 open");

  sec("3. A small party still fits alongside");
  const small = await availableSlotsForDay(r!.id, date, 4); // 4 ≤ 4 remaining
  ok(small.includes("19:00"), "party of 4 fits at 19:00 (exactly the remaining 4 seats)");
  ok(!(await availableSlotsForDay(r!.id, date, 5)).includes("19:00"), "party of 5 does NOT fit at 19:00");

  sec("4. validateBooking + createManualReservation honor the window");
  const vBad = await validateBooking(r!.id, date, "19:30", 8);
  ok(!vBad.ok, "validateBooking rejects overlapping oversell (19:30, party 8)");
  const vGood = await validateBooking(r!.id, date, "20:30", 8);
  ok(vGood.ok, "validateBooking accepts once window clears (20:30, party 8)");
  const manBlocked = await createManualReservation(r!.id, { date, time: "19:30", partySize: 8, guestName: "X", guestPhone: "0700000002" }, false);
  ok(!manBlocked.ok, "manual booking blocked at 19:30 (overlap)");
  const manForced = await createManualReservation(r!.id, { date, time: "19:30", partySize: 8, guestName: "X", guestPhone: "0700000002" }, true);
  ok(manForced.ok, "manual booking with force=true overrides (staff know the floor)");

  sec("5. Area isolation across the window");
  // Flip to areas and re-test that interior booking doesn't consume terrace seats.
  await db.update(restaurants).set({ reservationAreasEnabled: true }).where(eq(restaurants.id, r!.id));
  await db.update(reservationHours).set({ seatsInside: 10, seatsOutside: 10 }).where(eq(reservationHours.restaurantId, r!.id));
  await db.delete(reservations).where(eq(reservations.restaurantId, r!.id));
  await db.insert(reservations).values({ restaurantId: r!.id, date, time: "19:00", partySize: 10, guestName: "In", guestPhone: "0700000003", area: "inside", status: "confirmed" });
  const inside1930 = await availableSlotsForDay(r!.id, date, 4, "inside");
  const outside1930 = await availableSlotsForDay(r!.id, date, 4, "outside");
  ok(!inside1930.includes("19:30"), "interior full → 19:30 blocked inside (window)");
  ok(outside1930.includes("19:30"), "terasă still open at 19:30 (independent capacity)");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
