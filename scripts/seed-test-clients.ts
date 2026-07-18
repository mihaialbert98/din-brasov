/**
 * Seed test client accounts with reservations at the demo restaurant so the
 * restaurant "Clienți" (CRM) page and the admin "Email clienți" feature can be
 * tested. Idempotent (marker email domain @seed-client.test). Dev DB only.
 *
 * Run: pnpm tsx scripts/seed-test-clients.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { restaurants, reservations, users, newsletterSubscribers, restaurantClientNotes } from "../lib/db/schema";
import { eq, like, inArray } from "drizzle-orm";

const SLUG = "restaurant-test";
const PASSWORD = "Test1234!";
const DOMAIN = "seed-client.test";

function daysFrom(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG)).limit(1);
  if (!r) { console.error("No 'restaurant-test'"); process.exit(1); }

  // Wipe any prior seed clients (cascade clears their reservations/notes/subs).
  const prior = await db.select({ id: users.id }).from(users).where(like(users.email, `%@${DOMAIN}`));
  if (prior.length) {
    const ids = prior.map((u) => u.id);
    await db.delete(newsletterSubscribers).where(inArray(newsletterSubscribers.userId, ids));
    await db.delete(reservations).where(inArray(reservations.userId, ids));
    await db.delete(restaurantClientNotes).where(inArray(restaurantClientNotes.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }

  const hash = await bcrypt.hash(PASSWORD, 12);

  // Client definitions: [name, phone, subscriber?, note?, [ (dateOffset, time, party, status) ]]
  const defs: {
    name: string; phone: string; subscriber: boolean; note?: string;
    bookings: { off: number; time: string; party: number; status: string }[];
  }[] = [
    { name: "Andrei Munteanu", phone: "0722100001", subscriber: true, note: "Preferă masa la geam. Client fidel.",
      bookings: [ { off: 3, time: "19:00", party: 2, status: "confirmed" }, { off: -7, time: "20:00", party: 4, status: "confirmed" }, { off: -20, time: "19:30", party: 2, status: "confirmed" } ] },
    { name: "Elena Rusu", phone: "0722100002", subscriber: true, note: undefined,
      bookings: [ { off: 2, time: "13:00", party: 3, status: "confirmed" } ] },
    { name: "Familia Georgescu", phone: "0722100003", subscriber: false, note: "Vin cu copil — au nevoie de scaun înalt.",
      bookings: [ { off: 5, time: "18:30", party: 5, status: "pending" }, { off: -3, time: "20:30", party: 4, status: "confirmed" } ] },
    { name: "Ioana Petre", phone: "0722100004", subscriber: false, note: undefined,
      bookings: [ { off: -10, time: "21:00", party: 2, status: "confirmed" } ] },
  ];

  for (const c of defs) {
    const id = crypto.randomUUID();
    const email = `${c.name.toLowerCase().replace(/[^a-z]/g, ".")}@${DOMAIN}`;
    await db.insert(users).values({
      id, email, name: c.name, phone: c.phone, password: hash, emailVerified: new Date(), role: "user",
    });
    for (const b of c.bookings) {
      await db.insert(reservations).values({
        restaurantId: r.id, date: daysFrom(b.off), time: b.time, partySize: b.party,
        guestName: c.name, guestPhone: c.phone, userId: id, status: b.status,
      });
    }
    if (c.subscriber) {
      await db.insert(newsletterSubscribers).values({
        email, userId: id, wantsPlaces: true, status: "active",
        verificationToken: crypto.randomUUID(), verifiedAt: new Date(),
      });
    }
    if (c.note) {
      await db.insert(restaurantClientNotes).values({ restaurantId: r.id, userId: id, note: c.note });
    }
    console.log(`✓ ${c.name} — ${c.bookings.length} rezervare(i)${c.subscriber ? " · abonat newsletter" : ""}${c.note ? " · notiță" : ""}`);
  }

  console.log("\n========== READY ==========");
  console.log(`Clienți (CRM):   /restaurant/${r.slug}/clienti   (login as owner: mihai.albert.ioan+owner@gmail.com / ${PASSWORD})`);
  console.log(`Admin email:     /admin/restaurante → "Email clienți" on ${r.name}   (2 subscribed clients)`);
  console.log(`Login as a client: e.g. andrei.munteanu@${DOMAIN} / ${PASSWORD} → /profil to see 'Rezervările mele'`);
  process.exit(0);
}

main().catch((e) => { console.error("SEED ERROR:", e); process.exit(1); });
