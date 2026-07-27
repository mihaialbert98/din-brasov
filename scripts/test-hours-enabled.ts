/**
 * Pause/resume + edit of a reservation interval. A disabled interval stops offering
 * new slots (excluded from availability) but NEVER touches existing reservations;
 * re-enabling restores it exactly; editing the window reshapes only future slots.
 * Exercises the real availableSlotsForDay against reservation_hours.enabled + fields.
 * Throwaway restaurant (slug hrsen-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-hours-enabled.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, validateBooking, getReservationHours } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "hrsen-";
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);

  const [pl] = await db.insert(places).values({ name: "HrsEn", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "HrsEn", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  const [h] = await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 }).returning({ id: reservationHours.id });

  sec("1. Enabled interval offers slots (default enabled)");
  let slots = await availableSlotsForDay(r.id, date, 2);
  ok(slots.length > 0 && slots.includes("18:00"), `enabled → slots offered incl 18:00 — got ${slots.length}`);

  sec("2. Disabling excludes it; existing reservation untouched");
  const [res] = await db.insert(reservations).values({ restaurantId: r.id, date, time: "18:00", partySize: 2, guestName: "X", guestPhone: "0700000000", status: "confirmed" }).returning({ id: reservations.id });
  await db.update(reservationHours).set({ enabled: false }).where(eq(reservationHours.id, h.id)); // simulate the toggle
  slots = await availableSlotsForDay(r.id, date, 2);
  ok(slots.length === 0, `disabled → no slots offered — got ${slots.length}`);
  const [after] = await db.select({ time: reservations.time, status: reservations.status, partySize: reservations.partySize }).from(reservations).where(eq(reservations.id, res.id));
  ok(after?.time === "18:00" && after?.status === "confirmed" && after?.partySize === 2, "existing reservation is completely untouched by disabling");

  sec("3. Re-enabling restores availability exactly");
  await db.update(reservationHours).set({ enabled: true }).where(eq(reservationHours.id, h.id));
  slots = await availableSlotsForDay(r.id, date, 2);
  ok(slots.includes("18:00"), "re-enabled → slots offered again");

  sec("4. Editing the window reshapes only future slots");
  await db.update(reservationHours).set({ endTime: "19:00" }).where(eq(reservationHours.id, h.id)); // simulate PATCH endTime
  slots = await availableSlotsForDay(r.id, date, 2);
  // endTime is the last seating time (end-inclusive), so 19:00 stays but nothing after it.
  ok(!slots.some((s) => s > "19:00"), "after endTime→19:00, the late slots (19:30, 20:00…) are gone");
  ok(slots.includes("18:00"), "…but 18:00 is still offered");
  const [stillThere] = await db.select({ time: reservations.time }).from(reservations).where(eq(reservations.id, res.id));
  ok(stillThere?.time === "18:00", "the existing 18:00 reservation still stands after the edit");

  sec("5. Mixed: one enabled + one disabled window on the same day");
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "12:00", endTime: "15:00", slotMinutes: 30, seatsPerSlot: 20, enabled: false });
  slots = await availableSlotsForDay(r.id, date, 2);
  ok(!slots.some((s) => s >= "12:00" && s < "15:00"), "disabled lunch window offers nothing");
  ok(slots.includes("18:00"), "enabled dinner window still offers slots");

  sec("6. End-to-end booking gate (validateBooking) respects enabled");
  await db.update(reservationHours).set({ endTime: "22:00", enabled: true }).where(eq(reservationHours.id, h.id)); // restore dinner window, enabled
  let v = await validateBooking(r.id, date, "20:00", 2);
  ok(v.ok, "enabled window → validateBooking ACCEPTS a booking at 20:00");
  await db.update(reservationHours).set({ enabled: false }).where(eq(reservationHours.id, h.id)); // pause it
  v = await validateBooking(r.id, date, "20:00", 2);
  ok(!v.ok, "paused window → validateBooking REJECTS the same booking");

  sec("7. Client form day-chips exclude fully-paused days");
  // dow (Thursday) now has all intervals paused; add an ACTIVE interval on Friday (5).
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: 5, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });
  const allHours = await getReservationHours(r.id);
  const bookableDays = new Set(allHours.filter((hh) => hh.enabled).map((hh) => hh.dayOfWeek)); // mirrors ReservationForm.tsx
  ok(!bookableDays.has(dow), "a day whose intervals are ALL paused is NOT offered as a chip");
  ok(bookableDays.has(5), "a day with an active interval IS offered as a chip");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
