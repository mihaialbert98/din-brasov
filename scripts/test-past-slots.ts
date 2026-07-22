/**
 * Verifies: past time-slots are hidden for TODAY only (computed in the venue's local
 * timezone), while future dates keep every slot. Covers seats mode AND tables mode.
 * Throwaway restaurant (slug pastslot-*), self-cleaning — does NOT touch real data.
 *
 * Run: pnpm tsx scripts/test-past-slots.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservationHours, reservationTables, reservations } from "../lib/db/schema";
import { like, inArray, eq } from "drizzle-orm";
import { availableSlotsForDay } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Same computation the lib uses — "now" in the venue timezone.
function nowVenue(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  let h = parseInt(g("hour"), 10); if (h === 24) h = 0;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: h * 60 + parseInt(g("minute"), 10) };
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "pastslot-%"));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, "pastslot-%"));
}

async function main() {
  await cleanup();

  const now = nowVenue();
  const dow = new Date(`${now.date}T00:00:00`).getDay(); // matches lib's day derivation
  // Future date = today + 7 (same weekday, so the same window applies).
  const fd = new Date(`${now.date}T12:00:00Z`); fd.setUTCDate(fd.getUTCDate() + 7);
  const futureDate = fd.toISOString().slice(0, 10);

  // Full-day grid 00:00..23:45 @15min (matches an all-day window with 15-min slots).
  const grid: number[] = []; for (let m = 0; m <= 1425; m += 15) grid.push(m);
  const gridFmt = grid.map(fmt);
  const expectedToday = grid.filter((m) => m >= now.minutes).map(fmt); // past hidden

  console.log(`\nVenue now: ${now.date} ${fmt(now.minutes)}  (dow=${dow})   future=${futureDate}`);

  // ── Setup: all-day window today's weekday ─────────────────────────────────
  const [pl] = await db.insert(places).values({ name: "PastSlot", description: "t", slug: "pastslot-p", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "PastSlot", slug: "pastslot-r", placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 30, reservationMaxPartySize: 10,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "00:00", endTime: "23:45", slotMinutes: 15, seatsPerSlot: 20 });

  // ── SEATS MODE ────────────────────────────────────────────────────────────
  console.log("\n=== Seats mode ===");
  const sToday = await availableSlotsForDay(r.id, now.date, 2);
  const sFuture = await availableSlotsForDay(r.id, futureDate, 2);
  ok(sToday.every((s) => s >= fmt(now.minutes)) && !sToday.some((s) => grid.filter((m) => m < now.minutes).map(fmt).includes(s)), "today: no slot earlier than now");
  ok(JSON.stringify(sToday) === JSON.stringify(expectedToday), `today: exact match (${sToday.length} slots, first=${sToday[0] ?? "—"})`);
  ok(JSON.stringify(sFuture) === JSON.stringify(gridFmt), `future: ALL ${sFuture.length} slots kept (incl 00:00=${sFuture.includes("00:00")})`);
  if (now.minutes >= 15) {
    const past = fmt(Math.floor((now.minutes - 1) / 15) * 15);
    ok(!sToday.includes(past), `today: known-past slot ${past} is hidden`);
    ok(sFuture.includes(past), `future: same slot ${past} is present (date-scoped)`);
  } else {
    console.log("  (skipping known-past checks — it's the first 15 min of the day)");
  }

  // ── TABLES MODE ───────────────────────────────────────────────────────────
  console.log("\n=== Tables mode ===");
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r.id));
  await db.insert(reservationTables).values({ restaurantId: r.id, label: "M1", seats: 4, joinable: false });
  const tToday = await availableSlotsForDay(r.id, now.date, 2);
  const tFuture = await availableSlotsForDay(r.id, futureDate, 2);
  ok(JSON.stringify(tToday) === JSON.stringify(expectedToday), `today: exact match (${tToday.length} slots, first=${tToday[0] ?? "—"})`);
  ok(JSON.stringify(tFuture) === JSON.stringify(gridFmt), `future: ALL ${tFuture.length} slots kept`);

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
