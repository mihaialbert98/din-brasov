/**
 * DEMO DATA for the restaurant CRM notes feature (DEV branch only). Creates one
 * restaurant with a realistic spread of clients so you can click through:
 *   - account clients (with & without a note)
 *   - accountless "fără cont" diners keyed by phone (with & without a note)
 *   - a guest who booked under an account's phone (collapses into that account)
 *   - today/tomorrow bookings so the board shows the notes read-only, incl. one
 *     pending request and one with a per-booking mention.
 *
 * Run:    pnpm tsx scripts/seed-client-notes-demo.ts
 * Undo:   pnpm tsx scripts/seed-client-notes-demo.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, users, reservationHours, restaurantClientNotes } from "../lib/db/schema";
import { inArray, like } from "drizzle-orm";
import { upsertRestaurantClientNote } from "../lib/reservations";

const SLUG = "demo-clienti";
const PLACE_SLUG = "demo-clienti-loc";
const USER_PREFIX = "demo-clienti-";

// Local YYYY-MM-DD (matches the board's Azi/Mâine grouping, not UTC).
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = localISO(new Date());
const tomorrow = localISO(new Date(Date.now() + 86400000));

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${SLUG}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(restaurantClientNotes).where(inArray(restaurantClientNotes.restaurantId, rids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${PLACE_SLUG}%`));
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%`));
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing: DATABASE_URL is not the DEV branch.");
  }
  await clean();
  if (process.argv.includes("--clean")) { console.log("Demo data removed."); process.exit(0); }

  const [pl] = await db.insert(places).values({
    name: "Bistro Demo (clienți)", description: "Restaurant demonstrativ pentru notițele despre clienți.",
    slug: PLACE_SLUG, category: "Restaurant", address: "Piața Sfatului 1, Brașov", status: "published",
  }).returning({ id: places.id });

  const [r] = await db.insert(restaurants).values({
    name: "Bistro Demo (clienți)", slug: SLUG, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "manual", reservationCapacityMode: "seats",
    reservationTurnMinutes: 90, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });

  // Open every day 17:00–22:00 so the manual "Adaugă" also works if you try it.
  await db.insert(reservationHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ restaurantId: r.id, dayOfWeek, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 40 })),
  );

  // Account clients.
  const [ana] = await db.insert(users).values({ email: `${USER_PREFIX}ana@demo.local`, name: "Ana Popescu", role: "user", phone: "0740 100 100" }).returning({ id: users.id });
  const [bogdan] = await db.insert(users).values({ email: `${USER_PREFIX}bogdan@demo.local`, name: "Bogdan Ionescu", role: "user", phone: "0740 200 200" }).returning({ id: users.id });
  const [cristina] = await db.insert(users).values({ email: `${USER_PREFIX}cristina@demo.local`, name: "Cristina Marin", role: "user" }).returning({ id: users.id });

  const base = { restaurantId: r.id, partySize: 2, status: "confirmed" as const };
  await db.insert(reservations).values([
    // Account: Ana — 2 visits, has a note.
    { ...base, date: today, time: "19:00", guestName: "Ana Popescu", guestPhone: "0740 100 100", userId: ana.id, partySize: 4 },
    { ...base, date: tomorrow, time: "20:00", guestName: "Ana Popescu", guestPhone: "0740 100 100", userId: ana.id, partySize: 2 },
    // Account: Bogdan — no note (shows the empty "Adaugă o notiță" state) + a per-booking mention.
    { ...base, date: today, time: "18:30", guestName: "Bogdan Ionescu", guestPhone: "0740 200 200", userId: bogdan.id, partySize: 6, note: "Aniversare 🎂" },
    // Account: Cristina — has a note, no phone on the account (phone falls back to the booking's).
    { ...base, date: tomorrow, time: "19:30", guestName: "Cristina Marin", guestPhone: "0740 210 210", userId: cristina.id, partySize: 3 },
    // Guest (fără cont): Maria — 2 visits. The 2nd booking uses the SAME number with
    // different spacing AND a new name → still one row, showing the latest name.
    { ...base, date: today, time: "20:30", guestName: "Maria Zaharia", guestPhone: "0741 300 300", userId: null, partySize: 2 },
    { ...base, date: tomorrow, time: "18:00", guestName: "Maria Ionescu", guestPhone: "0741300300", userId: null, partySize: 2 },
    // Guest (fără cont): Ionuț — no note, PENDING (shows the amber Confirmă/Refuză card).
    { ...base, date: today, time: "21:00", guestName: "Ionuț (fără cont)", guestPhone: "0741 400 400", userId: null, partySize: 2, status: "pending" },
    // Guest booked under Ana's phone → collapses into Ana in the Clienți list; on the
    // board it shows with no client note (different identity than the account).
    { ...base, date: today, time: "19:15", guestName: "Prieten (a sunat pt. Ana)", guestPhone: "0740 100 100", userId: null, partySize: 2 },
  ]);

  // Notes — via the real upsert the app uses.
  await upsertRestaurantClientNote(r.id, { userId: ana.id }, "Client fidel — preferă masa de la geam. De obicei vine vinerea.");
  await upsertRestaurantClientNote(r.id, { userId: cristina.id }, "Alergică la nuci — atenție la desert.");
  await upsertRestaurantClientNote(r.id, { phone: "0741 300 300" }, "Preferă terasa, vine cu doi copii. Adu scaun înalt.");

  console.log(`\n✅ Demo seeded on DEV.\n`);
  console.log(`Owner CRM (Clienți):   http://localhost:3000/restaurant/${SLUG}/clienti`);
  console.log(`Reservations board:    http://localhost:3000/restaurant/${SLUG}/rezervari`);
  console.log(`Admin Clienți (email): http://localhost:3000/admin/localuri/${pl.id}/clienti`);
  console.log(`\nWhat to look for:`);
  console.log(`  • Clienți: 5 rows — Ana & Cristina (cont, cu notiță), Bogdan (cont, fără notiță),`);
  console.log(`    Maria (fără cont, cu notiță), Ionuț (fără cont, fără notiță). The guest who called`);
  console.log(`    for Ana is merged into her row (no duplicate). Maria booked twice with the SAME`);
  console.log(`    number formatted differently + a new name → one row showing "Maria Ionescu".`);
  console.log(`  • Board (Azi/Mâine): notes appear read-only in an amber box; Ionuț is a pending request;`);
  console.log(`    Bogdan's card shows the per-booking "Aniversare 🎂" separately from client notes.`);
  console.log(`\nRemove it later:  pnpm tsx scripts/seed-client-notes-demo.ts --clean\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
