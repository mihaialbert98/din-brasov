/**
 * Full end-to-end test setup for the reservations feature (DEV DB only).
 *
 * Makes "Restaurant Test" fully bookable and gives you known logins:
 *  - resets the OWNER + ADMIN passwords to a known value
 *  - links + publishes a Localuri place (so the public booking page resolves)
 *  - grants + enables reservations, sets confirm mode
 *  - adds bookable hours (Mon–Sun evenings)
 *  - seeds a few sample reservations (pending + confirmed) for the board
 *
 * Idempotent — safe to re-run. Run: pnpm tsx scripts/seed-reservations-e2e.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { restaurants, places, reservationHours, reservations, users } from "../lib/db/schema";
import { eq, and, like } from "drizzle-orm";
import { slugifyWithDate } from "../lib/slugify";

const TEST_PASSWORD = "Test1234!";
const OWNER_EMAIL = "mihai.albert.ioan+owner@gmail.com";
const ADMIN_EMAIL = "mihai.albert.ioan@gmail.com";
const CONFIRM_MODE: "auto" | "manual" = "manual"; // change to "auto" to test instant-confirm

function dateInDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-test")).limit(1);
  if (!r) { console.error("No 'restaurant-test'."); process.exit(1); }

  // 1. Known passwords.
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);
  for (const email of [OWNER_EMAIL, ADMIN_EMAIL]) {
    await db.update(users).set({ password: hash, emailVerified: new Date() }).where(eq(users.email, email));
  }
  console.log(`✓ Reset passwords for owner + admin to: ${TEST_PASSWORD}`);

  // 2. Linked, published Localuri place (reuse existing link if present).
  let placeId = r.placeId;
  if (!placeId) {
    placeId = crypto.randomUUID();
    await db.insert(places).values({
      id: placeId,
      name: r.name,
      description: r.description ?? "Restaurant de test pentru rezervări — Din Brașov.",
      slug: slugifyWithDate(r.name),
      category: "Restaurant",
      address: r.address ?? "Str. Republicii 1, Brașov",
      phone: r.phone ?? "0368000000",
      imagesJson: r.coverUrl ?? r.logoUrl ? JSON.stringify([r.coverUrl ?? r.logoUrl]) : null,
      status: "published",
    });
  } else {
    await db.update(places).set({ status: "published" }).where(eq(places.id, placeId));
  }
  const [place] = await db.select({ slug: places.slug }).from(places).where(eq(places.id, placeId)).limit(1);
  console.log(`✓ Localuri place published: /localuri/${place.slug}`);

  // 3. Enable everything + link place + show in Localuri.
  await db.update(restaurants).set({
    placeId,
    showInLocaluri: true,
    reservationsEnabledByAdmin: true,
    reservationsEnabledByOwner: true,
    reservationConfirmMode: CONFIRM_MODE,
  }).where(eq(restaurants.id, r.id));
  console.log(`✓ Reservations enabled (admin+owner), confirm mode = ${CONFIRM_MODE}`);

  // 4. Bookable hours — every day 17:00–22:00, 30-min slots, up to 10 people.
  await db.delete(reservationHours).where(eq(reservationHours.restaurantId, r.id));
  for (let day = 0; day < 7; day++) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek: day, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20,
    });
  }
  console.log("✓ Hours added: every day 17:00–22:00 (30-min slots, 20 seats/slot)");

  // 5. Sample reservations for the board (idempotent by a marker phone prefix).
  await db.delete(reservations).where(and(eq(reservations.restaurantId, r.id), like(reservations.guestPhone, "0799%")));
  const samples = [
    { date: dateInDays(1), time: "19:00", partySize: 2, guestName: "Andrei Pop", guestPhone: "0799000001", guestEmail: "andrei@example.com", status: "pending", note: "Masă la geam, vă rog" },
    { date: dateInDays(1), time: "20:30", partySize: 4, guestName: "Maria Ionescu", guestPhone: "0799000002", guestEmail: null, status: "pending", note: null },
    { date: dateInDays(2), time: "18:00", partySize: 6, guestName: "Familia Georgescu", guestPhone: "0799000003", guestEmail: "georgescu@example.com", status: "confirmed", note: "Aniversare" },
    { date: dateInDays(3), time: "21:00", partySize: 2, guestName: "Ioana D.", guestPhone: "0799000004", guestEmail: null, status: "confirmed", note: null },
  ];
  for (const s of samples) {
    await db.insert(reservations).values({ restaurantId: r.id, ...s });
  }
  console.log(`✓ Seeded ${samples.length} sample reservations (2 pending, 2 confirmed)`);

  console.log("\n========== READY TO TEST ==========");
  console.log(`Public place page:   /localuri/${place.slug}`);
  console.log(`Public booking:      /localuri/${place.slug}/rezervare`);
  console.log(`Public menu:         /localuri/${place.slug}/meniu`);
  console.log(`Owner dashboard:     /restaurant/${r.slug}/rezervari   (login: ${OWNER_EMAIL})`);
  console.log(`Staff board:         /s/${r.staffToken}   (Rezervări tab, no login)`);
  console.log(`Admin restaurants:   /admin/restaurante   (login: ${ADMIN_EMAIL})`);
  console.log(`Password (both):     ${TEST_PASSWORD}`);
  process.exit(0);
}

main().catch((e) => { console.error("SEED ERROR:", e); process.exit(1); });
