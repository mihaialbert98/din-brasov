/**
 * Turns "Restaurant Test" into a believable, demo-ready restaurant (dev only).
 * Updates the restaurant + its linked Localuri place with a real identity,
 * description, and polished imagery. Idempotent.
 *
 * Run: pnpm tsx scripts/make-restaurant-real.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { restaurants, places, reservations, reservationHours } from "../lib/db/schema";
import { eq, and, like } from "drizzle-orm";

const NAME = "Bistro Piața Sfatului";
const DESCRIPTION =
  "Bistro cochet în inima Brașovului, la câțiva pași de Piața Sfatului. Bucătărie " +
  "mediteraneană cu accente locale, ingrediente proaspete de sezon și o atmosferă " +
  "caldă, perfectă pentru un prânz relaxat sau o cină cu prietenii. Te așteptăm cu " +
  "paste făcute în casă, preparate la grătar și deserturi de care nu te saturi.";
const ADDRESS = "Str. Republicii 12, Brașov";
const PHONE = "0368 123 456";
// Warm, on-brand restaurant imagery (Unsplash, demo-appropriate).
const COVER = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=600&fit=crop";
const LOGO = "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=200&h=200&fit=crop";
const GALLERY = [
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=600&fit=crop",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=600&fit=crop",
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&h=600&fit=crop",
];

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-test")).limit(1);
  if (!r) { console.error("No 'restaurant-test'."); process.exit(1); }

  await db.update(restaurants).set({
    name: NAME,
    description: DESCRIPTION,
    address: ADDRESS,
    phone: PHONE,
    coverUrl: COVER,
    logoUrl: LOGO,
    updatedAt: new Date(),
  }).where(eq(restaurants.id, r.id));
  console.log(`✓ Restaurant → "${NAME}"`);

  if (r.placeId) {
    await db.update(places).set({
      name: NAME,
      description: DESCRIPTION,
      address: ADDRESS,
      phone: PHONE,
      imagesJson: JSON.stringify(GALLERY),
      status: "published",
      updatedAt: new Date(),
    }).where(eq(places.id, r.placeId));
    const [p] = await db.select({ slug: places.slug }).from(places).where(eq(places.id, r.placeId)).limit(1);
    console.log(`✓ Localuri place updated + published: /localuri/${p.slug}`);
  }

  // Ensure sensible bookable hours exist (every day, lunch + dinner split shift).
  await db.delete(reservationHours).where(eq(reservationHours.restaurantId, r.id));
  for (let day = 0; day < 7; day++) {
    await db.insert(reservationHours).values([
      { restaurantId: r.id, dayOfWeek: day, startTime: "12:00", endTime: "15:00", slotMinutes: 30, seatsPerSlot: 24 },
      { restaurantId: r.id, dayOfWeek: day, startTime: "18:00", endTime: "23:00", slotMinutes: 30, seatsPerSlot: 30 },
    ]);
  }
  console.log("✓ Hours: every day 12:00–15:00 & 18:00–23:00 (lunch + dinner)");

  // A few realistic reservations on the board (idempotent via marker phone prefix).
  await db.delete(reservations).where(and(eq(reservations.restaurantId, r.id), like(reservations.guestPhone, "0722%")));
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const samples = [
    { date: day(0), time: "19:00", partySize: 2, guestName: "Andrei Munteanu", guestPhone: "0722000001", guestEmail: "andrei.m@example.com", status: "confirmed", note: "Masă la geam" },
    { date: day(0), time: "20:30", partySize: 4, guestName: "Elena Rusu", guestPhone: "0722000002", guestEmail: null, status: "confirmed", note: null },
    { date: day(1), time: "13:00", partySize: 3, guestName: "Familia Dumitrescu", guestPhone: "0722000003", guestEmail: "dumitrescu@example.com", status: "confirmed", note: "Un scaun pentru copil, vă rog" },
    { date: day(1), time: "20:00", partySize: 6, guestName: "Grup birou", guestPhone: "0722000004", guestEmail: null, status: "confirmed", note: "Aniversare" },
    { date: day(2), time: "19:30", partySize: 2, guestName: "Ioana Petre", guestPhone: "0722000005", guestEmail: "ioana.p@example.com", status: "confirmed", note: null },
  ];
  for (const s of samples) await db.insert(reservations).values({ restaurantId: r.id, ...s });
  console.log(`✓ ${samples.length} sample reservations on the board`);

  console.log("\n========== DEMO READY ==========");
  console.log(`Public place page:  /localuri/${(await db.select({ slug: places.slug }).from(places).where(eq(places.id, r.placeId!)).limit(1))[0]?.slug}`);
  console.log(`Owner dashboard:    /restaurant/restaurant-test`);
  console.log(`Name:               ${NAME}`);
  process.exit(0);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
