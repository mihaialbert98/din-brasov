/**
 * DEMO DATA for the pause/resume + edit reservation-intervals feature (DEV only).
 * Creates a restaurant with a realistic weekly schedule that shows off every part:
 *   - split shifts (lunch + dinner) on Miercuri & Sâmbătă (two chips on one day)
 *   - a PRE-PAUSED interval on Joi (shows the "PAUZAT" state immediately)
 *   - two existing reservations (incl. one on the paused Joi) to prove pausing/editing
 *     never touches bookings already made.
 *
 * Run:    pnpm tsx scripts/seed-hours-demo.ts
 * Undo:   pnpm tsx scripts/seed-hours-demo.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours } from "../lib/db/schema";
import { inArray, like } from "drizzle-orm";

const SLUG = "demo-program";
const USER_PREFIX = "demo-program-";

/** Next occurrence (within 7 days, not today) of a weekday, as local YYYY-MM-DD. */
function nextDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 7; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    if (t.getDay() === dow) return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  return "";
}

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${SLUG}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${SLUG}%`));
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing: DATABASE_URL is not the DEV branch.");
  }
  await clean();
  if (process.argv.includes("--clean")) { console.log("Demo data removed."); process.exit(0); }

  const [pl] = await db.insert(places).values({
    name: "Bistro Program (demo)", description: "Restaurant demonstrativ pentru programul de rezervări.",
    slug: SLUG, category: "Restaurant", address: "Str. Republicii 5, Brașov", status: "published",
  }).returning({ id: places.id });

  const [r] = await db.insert(restaurants).values({
    name: "Bistro Program (demo)", slug: SLUG, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "manual", reservationCapacityMode: "seats",
    reservationTurnMinutes: 90, reservationMaxPartySize: 8,
  }).returning({ id: restaurants.id });

  // Weekly schedule. Duminică (0) closed. Joi (4) is PRE-PAUSED. Mie/Sâm have split shifts.
  const win = (dayOfWeek: number, startTime: string, endTime: string, seatsPerSlot: number, enabled = true) =>
    ({ restaurantId: r.id, dayOfWeek, startTime, endTime, slotMinutes: 30, seatsPerSlot, enabled });
  await db.insert(reservationHours).values([
    win(1, "18:00", "22:00", 30),                       // Luni — dinner
    win(2, "18:00", "22:00", 30),                       // Marți — dinner
    win(3, "12:00", "15:00", 25), win(3, "18:00", "22:00", 30), // Miercuri — lunch + dinner
    win(4, "18:00", "22:00", 30, false),                // Joi — dinner, PAUSED
    win(5, "17:00", "23:00", 40),                       // Vineri — long dinner
    win(6, "12:00", "16:00", 30), win(6, "18:00", "23:00", 40), // Sâmbătă — lunch + dinner
  ]);

  // Existing reservations that must survive pausing/editing.
  const base = { restaurantId: r.id, partySize: 2, status: "confirmed" as const, guestPhone: "0740 500 500" };
  await db.insert(reservations).values([
    { ...base, date: nextDow(4), time: "19:00", guestName: "Rezervare pe Joi (zi pauzată)", partySize: 2 },
    { ...base, date: nextDow(5), time: "20:00", guestName: "Rezervare pe Vineri", partySize: 4 },
  ]);

  console.log(`\n✅ Demo seeded on DEV.\n`);
  console.log(`Setări program (aici testezi):  http://localhost:3000/restaurant/${SLUG}/rezervari-setari`);
  console.log(`Board rezervări:                http://localhost:3000/restaurant/${SLUG}/rezervari`);
  console.log(`Formular public (client):       http://localhost:3000/localuri/${SLUG}/rezervare`);
  console.log(`\nWhat to try:`);
  console.log(`  • Setări: the week shows Joi as "PAUZAT" (amber), and Miercuri/Sâmbătă have TWO intervals.`);
  console.log(`    Use ⏸/▶ to pause/resume any interval, and ✎ to edit its hours/slot/seats.`);
  console.log(`  • Public form: pick JOI → no time slots (paused); pick Luni/Vineri → slots appear.`);
  console.log(`    Resume Joi in Setări, reload the form → slots come back.`);
  console.log(`  • Board: the "Rezervare pe Joi" booking is still there even though Joi is paused —`);
  console.log(`    pausing/editing never affects existing reservations.`);
  console.log(`\nRemove it later:  pnpm tsx scripts/seed-hours-demo.ts --clean\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
