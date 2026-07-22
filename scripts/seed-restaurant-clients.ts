/**
 * DEV-ONLY demo seed for the admin restaurant-clients feature
 * (/admin/localuri/[id]/clienti — list, counter, select + email promotions).
 *
 * Creates one published restaurant ("Bistro Demo Clienți") with 26 account-holding
 * clients who have reserved there. ~2/3 are ACTIVE newsletter subscribers (emailable);
 * the rest have NO email consent (shown but not selectable). Clients have 1–3 bookings
 * each (to exercise de-dup + visit counts), spread over time (to exercise ordering +
 * pagination at 20/page). Idempotent — re-running wipes and recreates the demo data.
 *
 * Run: pnpm tsx scripts/seed-restaurant-clients.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) { console.error("✗ No DATABASE_URL in .env.local"); process.exit(1); }
// Safety rail: never touch the pooled PRODUCTION branch.
if (url.includes("ep-spring-brook-a2h7iaap")) {
  console.error("✗ Refusing to run — DATABASE_URL points at PRODUCTION. Use the dev branch in .env.local.");
  process.exit(1);
}
const sql = neon(url);
const db = drizzle(sql, { schema });

const PLACE_SLUG = "demo-clienti";
const REST_SLUG = "demo-clienti-restaurant";
const EMAIL_PREFIX = "demo-client-"; // demo-client-<i>@example.test

const FIRST = ["Andrei", "Maria", "Ioana", "Vlad", "Elena", "Radu", "Ana", "Mihai", "Diana", "Cristian", "Raluca", "George", "Bianca", "Paul", "Alina", "Sorin", "Gabriela", "Tudor", "Carmen", "Bogdan", "Simona", "Alexandru", "Roxana", "Cătălin", "Larisa", "Ștefan"];
const LAST = ["Popescu", "Ionescu", "Munteanu", "Georgescu", "Stoica", "Dumitru", "Marin", "Nistor", "Barbu", "Cristea", "Radu", "Enache", "Florea", "Dobre", "Toma", "Voicu", "Lungu", "Sandu", "Petrescu", "Coman", "Iordache", "Neagu", "Tabără", "Vasilescu", "Mocanu", "Ilie"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  // Restaurant + its reservations/hours/tables, then the place.
  const rests = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.slug, REST_SLUG));
  const rids = rests.map((r) => r.id);
  if (rids.length) {
    await db.delete(schema.reservations).where(inArray(schema.reservations.restaurantId, rids));
    await db.delete(schema.reservationHours).where(inArray(schema.reservationHours.restaurantId, rids));
    await db.delete(schema.reservationTables).where(inArray(schema.reservationTables.restaurantId, rids));
    await db.delete(schema.restaurants).where(inArray(schema.restaurants.id, rids));
  }
  await db.delete(schema.places).where(eq(schema.places.slug, PLACE_SLUG));

  // Demo users + their newsletter rows (FK cascade would cover subs, but be explicit).
  const demoUsers = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `${EMAIL_PREFIX}%`));
  const uids = demoUsers.map((u) => u.id);
  if (uids.length) {
    await db.delete(schema.newsletterSubscribers).where(inArray(schema.newsletterSubscribers.userId, uids));
    await db.delete(schema.users).where(inArray(schema.users.id, uids));
  }
}

async function main() {
  console.log("🧹 Cleaning previous demo data…");
  await cleanup();

  console.log("🏠 Creating the demo restaurant…");
  const [place] = await db.insert(schema.places).values({
    name: "Bistro Demo Clienți",
    description: "Local demo pentru testarea listei de clienți din panoul de admin.",
    slug: PLACE_SLUG,
    category: "Restaurant",
    address: "Str. Republicii 1, Brașov",
    status: "published",
  }).returning({ id: schema.places.id });

  const [restaurant] = await db.insert(schema.restaurants).values({
    name: "Bistro Demo Clienți",
    slug: REST_SLUG,
    placeId: place.id,
    status: "active",
    showInLocaluri: true,
    reservationsEnabledByAdmin: true,
    reservationsEnabledByOwner: true,
    reservationConfirmMode: "auto",
    reservationMaxPartySize: 12,
  }).returning({ id: schema.restaurants.id });

  // Bookable weekday windows (so the local shows green "Rezervări" in the list).
  await db.insert(schema.reservationHours).values(
    [1, 2, 3, 4, 5].map((dow) => ({
      restaurantId: restaurant.id, dayOfWeek: dow,
      startTime: "12:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 40,
    })),
  );

  console.log("👤 Creating 26 clients with reservations…");
  const N = 26;
  let subscribedCount = 0;
  let reservationCount = 0;

  for (let i = 0; i < N; i++) {
    const name = `${FIRST[i]} ${LAST[i]}`.replace(/\s+/g, " ").trim();
    const email = `${EMAIL_PREFIX}${i}@example.test`;
    const phone = `07${String(40000000 + i).padStart(8, "0")}`; // 0740000000+i
    // Give ~half an account phone; the rest fall back to the booking's guest phone.
    const accountPhone = i % 2 === 0 ? phone : null;

    const [user] = await db.insert(schema.users).values({
      name, email, phone: accountPhone, role: "user",
      emailVerified: new Date(),
    }).returning({ id: schema.users.id });

    // ~2/3 are active newsletter subscribers (emailable). Interleaved so both
    // consented + non-consented clients appear on each page.
    const subscribed = i % 3 !== 0;
    if (subscribed) {
      subscribedCount++;
      await db.insert(schema.newsletterSubscribers).values({
        email, userId: user.id,
        wantsPlaces: true, wantsExperiences: true,
        status: "active",
        verificationToken: crypto.randomUUID(),
        verifiedAt: new Date(),
      });
    }

    // 1–3 bookings each; newest one at (today - i*3d) so ordering spans 2 pages.
    const bookings = 1 + (i % 3);
    for (let b = 0; b < bookings; b++) {
      const daysAgo = i * 3 + b * 21 - 10; // some future (negative), most past
      await db.insert(schema.reservations).values({
        restaurantId: restaurant.id,
        date: isoDaysAgo(daysAgo),
        time: ["12:30", "13:00", "19:00", "19:30", "20:00"][(i + b) % 5],
        partySize: 2 + ((i + b) % 4),
        guestName: name,
        guestPhone: phone,
        guestEmail: subscribed ? email : null,
        userId: user.id,
        status: b === 0 && i % 7 === 0 ? "pending" : "confirmed",
      });
      reservationCount++;
    }
  }

  console.log("\n✅ Done.");
  console.log(`   Restaurant: Bistro Demo Clienți`);
  console.log(`   Clients: ${N}  ·  Emailable (subscribed): ${subscribedCount}  ·  No consent: ${N - subscribedCount}`);
  console.log(`   Reservations inserted: ${reservationCount}`);
  console.log("\n🔗 Where to test:");
  console.log(`   Admin list:    /admin/localuri   → find "Bistro Demo Clienți" → button "Clienți (${N})"`);
  console.log(`   Clients page:  /admin/localuri/${place.id}/clienti`);
  console.log(`   (place id = ${place.id})`);
  process.exit(0);
}

main().catch((e) => { console.error("SEED ERROR:", e); process.exit(1); });
