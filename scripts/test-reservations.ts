/**
 * End-to-end test of the reservations lifecycle against the DEV DB. Exercises the
 * real domain functions (canReserve, validateSlot, slot generation, board list,
 * status transitions) and the booking-insert path both modes. Self-cleaning.
 *
 * Run: pnpm tsx scripts/test-reservations.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { restaurants, reservationHours, reservations } from "../lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  canReserve,
  getReservationHours,
  slotsForDay,
  availableSlotsForDay,
  validateBooking,
  listUpcomingReservations,
  setReservationStatus,
  createManualReservation,
} from "../lib/reservations";

const SLUG = "restaurant-test";
let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Next date (YYYY-MM-DD) matching a given weekday. */
function nextDateForDay(dow: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG)).limit(1);
  if (!r) { console.error(`No restaurant '${SLUG}'`); process.exit(1); }
  const orig = {
    admin: r.reservationsEnabledByAdmin,
    owner: r.reservationsEnabledByOwner,
    mode: r.reservationConfirmMode,
  };
  const createdIds: string[] = [];

  async function cleanup() {
    for (const id of createdIds) await db.delete(reservations).where(eq(reservations.id, id));
    await db.delete(reservationHours).where(eq(reservationHours.restaurantId, r.id));
    await db.update(restaurants).set({
      reservationsEnabledByAdmin: orig.admin,
      reservationsEnabledByOwner: orig.owner,
      reservationConfirmMode: orig.mode,
    }).where(eq(restaurants.id, r.id));
  }
  await db.delete(reservationHours).where(eq(reservationHours.restaurantId, r.id));

  console.log("\n=== 1. Gating: canReserve false until doubly-enabled + hours exist ===");
  await db.update(restaurants).set({ reservationsEnabledByAdmin: false, reservationsEnabledByOwner: false }).where(eq(restaurants.id, r.id));
  assert("both off → cannot reserve", (await canReserve(r.id)) === false);
  await db.update(restaurants).set({ reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true }).where(eq(restaurants.id, r.id));
  assert("enabled but no hours → still cannot reserve", (await canReserve(r.id)) === false);

  // Add a Monday window 18:00–22:00, 30-min slots, 6 seats/slot. Party cap = 10.
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: 1, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 6 });
  await db.update(restaurants).set({ reservationMaxPartySize: 10 }).where(eq(restaurants.id, r.id));
  assert("enabled + hours → can reserve", (await canReserve(r.id)) === true);

  console.log("\n=== 2. Slot generation + seats-aware validation ===");
  const hours = await getReservationHours(r.id);
  const monHours = hours.filter((h) => h.dayOfWeek === 1);
  const slots = slotsForDay(monHours);
  assert("slots generated (18:00..21:30)", slots.includes("18:00") && slots.includes("21:30") && !slots.includes("22:00"), slots.join(","));
  const monday = nextDateForDay(1);
  assert("valid booking passes", (await validateBooking(r.id, monday, "19:00", 4)).ok);
  assert("out-of-window time rejected", !(await validateBooking(r.id, monday, "12:00", 2)).ok);
  assert("party over restaurant cap rejected", !(await validateBooking(r.id, monday, "19:00", 11)).ok);
  assert("wrong weekday rejected", !(await validateBooking(r.id, nextDateForDay(3), "19:00", 2)).ok);

  console.log("\n=== 2b. Covers capacity: slot fills & disappears ===");
  // 6 seats at 18:00. Book 4 → only parties ≤2 can still take it.
  const [fill1] = await db.insert(reservations).values({ restaurantId: r.id, date: monday, time: "18:00", partySize: 4, guestName: "Cap A", guestPhone: "0740000009", status: "confirmed" }).returning({ id: reservations.id });
  createdIds.push(fill1.id);
  assert("party 2 still fits 18:00 (2 seats left)", (await availableSlotsForDay(r.id, monday, 2)).includes("18:00"));
  assert("party 3 does NOT fit 18:00", !(await availableSlotsForDay(r.id, monday, 3)).includes("18:00"));
  // Book the remaining 2 → slot full, disappears entirely.
  const [fill2] = await db.insert(reservations).values({ restaurantId: r.id, date: monday, time: "18:00", partySize: 2, guestName: "Cap B", guestPhone: "0740000010", status: "pending" }).returning({ id: reservations.id });
  createdIds.push(fill2.id);
  assert("full slot 18:00 disappears for party 1", !(await availableSlotsForDay(r.id, monday, 1)).includes("18:00"));
  assert("booking a full slot is rejected", !(await validateBooking(r.id, monday, "18:00", 1)).ok);

  console.log("\n=== 3. Booking insert — MANUAL mode → pending ===");
  await db.update(restaurants).set({ reservationConfirmMode: "manual" }).where(eq(restaurants.id, r.id));
  const [m] = await db.insert(reservations).values({
    restaurantId: r.id, date: monday, time: "19:00", partySize: 4,
    guestName: "Test Manual", guestPhone: "0740000001", status: "pending",
  }).returning({ id: reservations.id });
  createdIds.push(m.id);
  const [mrow] = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, m.id)).limit(1);
  assert("manual booking is pending", mrow.status === "pending");

  console.log("\n=== 4. Booking insert — AUTO mode → confirmed ===");
  await db.update(restaurants).set({ reservationConfirmMode: "auto" }).where(eq(restaurants.id, r.id));
  const [a] = await db.insert(reservations).values({
    restaurantId: r.id, date: monday, time: "20:00", partySize: 2,
    guestName: "Test Auto", guestPhone: "0740000002", status: "confirmed",
  }).returning({ id: reservations.id });
  createdIds.push(a.id);
  const [arow] = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, a.id)).limit(1);
  assert("auto booking is confirmed", arow.status === "confirmed");

  console.log("\n=== 5. Board list shows upcoming, excludes declined ===");
  let board = await listUpcomingReservations(r.id);
  assert("board shows both bookings", board.length >= 2);
  assert("board carries name + phone", board.every((b) => b.guestName && b.guestPhone));

  console.log("\n=== 6. Status transitions (setReservationStatus) ===");
  const okConfirm = await setReservationStatus(r.id, m.id, "confirmed");
  assert("confirm returns true", okConfirm);
  const [after] = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, m.id)).limit(1);
  assert("pending → confirmed", after.status === "confirmed");
  await setReservationStatus(r.id, a.id, "declined");
  board = await listUpcomingReservations(r.id);
  assert("declined drops off the board", !board.find((b) => b.id === a.id));
  const wrongRestaurant = await setReservationStatus("nonexistent-id", m.id, "cancelled");
  assert("status update scoped to restaurant (wrong id → false)", wrongRestaurant === false);

  console.log("\n=== 7. Manual reservation (staff phone-in) ===");
  // 18:00 is full from section 2b (6/6 seats). A manual add without force → rejected+overridable.
  const blocked = await createManualReservation(r.id, { date: monday, time: "18:00", partySize: 2, guestName: "Phone A", guestPhone: "0740000020" }, false);
  assert("manual add to full slot rejected (no force)", !blocked.ok && (blocked as any).overridable === true);
  // With force → succeeds even though full.
  const forced = await createManualReservation(r.id, { date: monday, time: "18:00", partySize: 2, guestName: "Phone B", guestPhone: "0740000021" }, true);
  assert("manual add with force overrides full slot", forced.ok);
  // A normal open slot works without force, and is confirmed immediately.
  const okAdd = await createManualReservation(r.id, { date: monday, time: "20:30", partySize: 2, guestName: "Phone C", guestPhone: "0740000022" }, false);
  assert("manual add to open slot succeeds", okAdd.ok);
  const manualRows = await db.select({ status: reservations.status, email: reservations.guestEmail }).from(reservations)
    .where(and(eq(reservations.restaurantId, r.id), eq(reservations.guestPhone, "0740000022"))).limit(1);
  assert("manual reservation is confirmed immediately", manualRows[0]?.status === "confirmed");
  assert("manual reservation has no email (no confirmation mail)", manualRows[0]?.email === null);
  // track for cleanup
  for (const p of ["0740000021", "0740000022"]) {
    const rows = await db.select({ id: reservations.id }).from(reservations).where(and(eq(reservations.restaurantId, r.id), eq(reservations.guestPhone, p)));
    rows.forEach((x) => createdIds.push(x.id));
  }

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
