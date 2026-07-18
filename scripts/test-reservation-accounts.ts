/**
 * E2E test for reservation-account features (dev DB): user-scoped cancel (+ frees
 * seats + rebook slug), CRM de-dup (one row per user across bookings), and the
 * admin email recipient intersection (clients ∩ active subscribers). Self-cleaning.
 *
 * Run: pnpm tsx scripts/test-reservation-accounts.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { restaurants, reservationHours, reservations, users, newsletterSubscribers } from "../lib/db/schema";
import { eq, and, isNotNull, inArray, sql } from "drizzle-orm";
import { cancelOwnReservation, availableSlotsForDay } from "../lib/reservations";

const SLUG = "restaurant-test";
let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nextDateForDay(dow: number): string {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG)).limit(1);
  if (!r) { console.error("No 'restaurant-test'"); process.exit(1); }

  // Two throwaway users.
  const u1 = crypto.randomUUID(), u2 = crypto.randomUUID();
  await db.insert(users).values([
    { id: u1, email: `acct-test-${u1}@test.local`, name: "Client Unu", role: "user" },
    { id: u2, email: `acct-test-${u2}@test.local`, name: "Client Doi", role: "user" },
  ]);

  // Clean slate: single Wednesday window, 6 seats, areas off.
  const origAreas = r.reservationAreasEnabled;
  await db.update(restaurants).set({ reservationAreasEnabled: false }).where(eq(restaurants.id, r.id));
  await db.delete(reservationHours).where(eq(reservationHours.restaurantId, r.id));
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: 3, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 6 });
  const wed = nextDateForDay(3);
  const createdRes: string[] = [];

  console.log("\n=== 1. User-scoped cancel (own only) + frees seats ===");
  // u1 books 4 seats at 19:00 (cap 6).
  const [b1] = await db.insert(reservations).values({ restaurantId: r.id, date: wed, time: "19:00", partySize: 4, guestName: "Client Unu", guestPhone: "0799111000", userId: u1, status: "confirmed" }).returning({ id: reservations.id });
  createdRes.push(b1.id);
  assert("before cancel: 19:00 full for party 3", !(await availableSlotsForDay(r.id, wed, 3)).includes("19:00"));
  // u2 cannot cancel u1's reservation.
  const wrong = await cancelOwnReservation(u2, b1.id);
  assert("another user cannot cancel it", !wrong.ok);
  // u1 cancels their own.
  const ok = await cancelOwnReservation(u1, b1.id);
  assert("owner-user cancel succeeds", ok.ok);
  const [after] = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, b1.id)).limit(1);
  assert("status → cancelled", after.status === "cancelled");
  assert("cancel frees the seats (19:00 open again for party 6)", (await availableSlotsForDay(r.id, wed, 6)).includes("19:00"));
  assert("cancel returns place slug for rebook", ok.ok && ok.placeSlug !== undefined);
  // Can't cancel an already-cancelled one.
  const again = await cancelOwnReservation(u1, b1.id);
  assert("cannot re-cancel", !again.ok);

  console.log("\n=== 2. CRM de-dup: same user, multiple bookings = one client row ===");
  // u1 makes 3 bookings (across dates), u2 makes 1.
  for (const t of ["18:00", "20:00", "21:00"]) {
    const [x] = await db.insert(reservations).values({ restaurantId: r.id, date: wed, time: t, partySize: 2, guestName: "Client Unu", guestPhone: "0799111000", userId: u1, status: "confirmed" }).returning({ id: reservations.id });
    createdRes.push(x.id);
  }
  const [y] = await db.insert(reservations).values({ restaurantId: r.id, date: wed, time: "18:30", partySize: 2, guestName: "Client Doi", guestPhone: "0799222000", userId: u2, status: "confirmed" }).returning({ id: reservations.id });
  createdRes.push(y.id);
  // Replicate the CRM aggregation query.
  const clients = await db
    .select({ userId: reservations.userId, visits: sql<number>`count(*)::int` })
    .from(reservations)
    .innerJoin(users, eq(reservations.userId, users.id))
    .where(and(eq(reservations.restaurantId, r.id), isNotNull(reservations.userId), inArray(reservations.userId, [u1, u2])))
    .groupBy(reservations.userId);
  assert("two distinct client rows (no duplicates)", clients.length === 2, `got ${clients.length}`);
  const u1row = clients.find((c) => c.userId === u1);
  assert("u1 aggregated visit count = 4 (3 new + 1 cancelled still counts as a booking)", u1row?.visits === 4, `got ${u1row?.visits}`);

  console.log("\n=== 3. Admin email recipients: clients ∩ active subscribers ===");
  // Only u1 is a subscriber.
  await db.insert(newsletterSubscribers).values({ email: `acct-test-${u1}@test.local`, userId: u1, wantsPlaces: true, status: "active", verificationToken: crypto.randomUUID(), verifiedAt: new Date() });
  const clientIds = [u1, u2];
  const recipients = await db
    .select({ email: newsletterSubscribers.email })
    .from(newsletterSubscribers)
    .innerJoin(users, eq(newsletterSubscribers.userId, users.id))
    .where(and(inArray(users.id, clientIds), eq(newsletterSubscribers.status, "active")));
  assert("only the subscribed client is a recipient", recipients.length === 1 && recipients[0].email.includes(u1));

  // Cleanup.
  await db.delete(newsletterSubscribers).where(inArray(newsletterSubscribers.userId, [u1, u2]));
  await db.delete(reservations).where(inArray(reservations.id, createdRes));
  await db.delete(users).where(inArray(users.id, [u1, u2]));
  await db.update(restaurants).set({ reservationAreasEnabled: origAreas }).where(eq(restaurants.id, r.id));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
