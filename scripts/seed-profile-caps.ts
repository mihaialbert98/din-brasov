/**
 * Seed data for testing the profile "max 3 + see-all" caps (Item 3) and the
 * anonymous-reservation backlink (Item 6). DEV DB only. Idempotent.
 *
 * Creates ONE account with >3 listings AND >3 reservations, plus one ANONYMOUS
 * reservation (no userId) whose guest_email matches a not-yet-registered address
 * so you can register/confirm that email and watch it appear in the profile.
 *
 * Run: pnpm tsx scripts/seed-profile-caps.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { restaurants, reservations, listings, users } from "../lib/db/schema";
import { eq, like, inArray, and, isNull } from "drizzle-orm";
import { slugifyWithDate } from "../lib/slugify";

const SLUG = "restaurant-test";
const PASSWORD = "Test1234!";
const HEAVY_EMAIL = "heavy.user@caps.test"; // account with >3 of each
const ANON_EMAIL = "anon.booker@caps.test"; // NOT registered — for the backlink test
const EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function daysFrom(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG)).limit(1);
  if (!r) {
    console.error(`No '${SLUG}'. Run: pnpm tsx scripts/seed-reservations-e2e.ts first.`);
    process.exit(1);
  }

  // ── Clean prior runs (heavy user cascade + anon booking) ──────────────────
  const prior = await db.select({ id: users.id }).from(users).where(eq(users.email, HEAVY_EMAIL));
  if (prior.length) {
    const ids = prior.map((u) => u.id);
    await db.delete(reservations).where(inArray(reservations.userId, ids));
    await db.delete(listings).where(inArray(listings.sellerId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  // Remove any leftover anon booking from a prior run (matched by guest email).
  await db.delete(reservations).where(
    and(like(reservations.guestEmail, ANON_EMAIL), isNull(reservations.userId)),
  );
  // If the anon email was already registered by a prior manual test, drop it so
  // the backlink test starts clean.
  await db.delete(users).where(eq(users.email, ANON_EMAIL));

  // ── Heavy user: >3 listings + >3 reservations ─────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 12);
  const [heavy] = await db
    .insert(users)
    .values({
      email: HEAVY_EMAIL,
      name: "Testuser Multe",
      password: hash,
      emailVerified: new Date(),
      role: "user",
      gdprConsentAt: new Date(),
    })
    .returning({ id: users.id });

  // 5 listings (>3 → cap kicks in + see-all page)
  const listingTitles = [
    "Canapea extensibilă",
    "Bicicletă de oraș",
    "Frigider Arctic",
    "Birou lemn masiv",
    "Mașină de spălat",
  ];
  for (let i = 0; i < listingTitles.length; i++) {
    await db.insert(listings).values({
      title: listingTitles[i],
      description: `Anunț de test #${i + 1} pentru pagina profil.`,
      slug: slugifyWithDate(listingTitles[i]),
      price: String(100 + i * 50),
      currency: "RON",
      category: "Altele",
      city: "Brașov",
      sellerId: heavy.id,
      contactPhone: "0722500000",
      status: "active",
      expiresAt: EXPIRES,
    });
  }

  // 5 reservations: 4 upcoming (mix pending/confirmed) + 1 past → >3 upcoming
  const bookings = [
    { off: 2, time: "19:00", party: 2, status: "confirmed" as const },
    { off: 3, time: "20:00", party: 4, status: "pending" as const },
    { off: 5, time: "18:30", party: 2, status: "confirmed" as const },
    { off: 7, time: "21:00", party: 3, status: "pending" as const },
    { off: -10, time: "19:30", party: 2, status: "confirmed" as const }, // past
  ];
  for (const b of bookings) {
    await db.insert(reservations).values({
      restaurantId: r.id,
      date: daysFrom(b.off),
      time: b.time,
      partySize: b.party,
      guestName: "Testuser Multe",
      guestPhone: "0722500000",
      guestEmail: HEAVY_EMAIL,
      userId: heavy.id,
      status: b.status,
    });
  }

  // ── Anonymous booking (no userId) for the backlink test ───────────────────
  await db.insert(reservations).values({
    restaurantId: r.id,
    date: daysFrom(4),
    time: "20:30",
    partySize: 2,
    guestName: "Vizitator Anonim",
    guestPhone: "0722600000",
    guestEmail: ANON_EMAIL,
    userId: null,
    status: "pending",
  });

  console.log("✓ Seeded profile-cap test data (DEV DB).\n");
  console.log("── Heavy account (profile cap 3 + see-all) ──");
  console.log(`   Login:  ${HEAVY_EMAIL}  /  ${PASSWORD}`);
  console.log("   Has: 5 listings, 4 upcoming + 1 past reservation");
  console.log("   → /profil shows 3 of each + 'Vezi toate' links");
  console.log("   → /profil/rezervari and /profil/anunturi paginate the rest\n");
  console.log("── Anonymous backlink (Item 6) ──");
  console.log(`   Anon reservation exists with guest_email = ${ANON_EMAIL} (userId NULL)`);
  console.log(`   Register a NEW account with email ${ANON_EMAIL}, confirm it,`);
  console.log("   then log in → /profil should show that reservation (userId now set).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
