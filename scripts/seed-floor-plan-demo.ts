/**
 * DEMO DATA for „Plan de sală” (DEV only).
 *
 * One restaurant on „Capacitate totală” with a drawn room:
 *   Sala 1  → m1, m2, m3
 *   Terasă  → t1, t2
 *
 * Plus three bookings tomorrow that make the rule visible in one screen:
 *   19:00 Popescu   (4 pers.)  already on m1 + m3  → holds them until 20:30
 *   20:00 Ionescu   (2 pers.)  no table yet        → m1/m3 show as busy in its picker
 *   20:30 Marinescu (2 pers.)  no table yet        → m1/m3 are free again for it
 *
 * Walk-through once seeded:
 *   1. Plan de sală → add/rename/move a table; delete a section and watch its tables fall
 *      into „Fără secțiune” with the assignments intact.
 *   2. Rezervări → „Mese” on Ionescu: m1 and m3 are greyed out and say who holds them.
 *   3. Rezervări → „Mese” on Marinescu: m1 and m3 are selectable — Popescu's booking ended.
 *   4. Edit Ionescu to 21:00 after giving it m1 → it keeps the table (no clash there).
 *   5. Confirm nothing is ever required: leave every booking unassigned and it behaves
 *      exactly as before.
 *
 * Run:    pnpm tsx scripts/seed-floor-plan-demo.ts
 * Undo:   pnpm tsx scripts/seed-floor-plan-demo.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, restaurantMembers, reservations, reservationHours, floorSections, floorTables, users } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";

const SLUG = "demo-plan-sala";
// Whoever runs this becomes the demo restaurant's OWNER, so the pages are seen exactly as
// a real owner sees them (a platform admin can reach them anyway, but that's a different
// role and a different label). Override with: OWNER_EMAIL=... pnpm tsx scripts/…
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "mihai.albert.ioan@gmail.com";

function inDays(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${SLUG}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(restaurantMembers).where(inArray(restaurantMembers.restaurantId, ids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(floorTables).where(inArray(floorTables.restaurantId, ids));
    await db.delete(floorSections).where(inArray(floorSections.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${SLUG}%`));
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing: DATABASE_URL is not the DEV branch.");
  }
  await clean();
  if (process.argv.includes("--clean")) { console.log("Demo data removed."); process.exit(0); }

  const name = "Hanul cu Plan (demo)";
  const [pl] = await db.insert(places).values({
    name, description: "Restaurant demonstrativ pentru planul de sală.",
    slug: SLUG, category: "Restaurant", address: "Str. Republicii 12, Brașov", status: "published",
  }).returning({ id: places.id });

  const [r] = await db.insert(restaurants).values({
    name, slug: SLUG, placeId: pl.id, status: "active", showInLocaluri: true,
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "manual",
    reservationCapacityMode: "seats", // „Plan de sală” is offered only in this mode
    reservationTurnMinutes: 90,
    reservationLongTurnEnabled: true, reservationLongTurnFromParty: 6, reservationLongTurnMinutes: 120,
    reservationAllowReducedTurn: true,
    reservationMaxPartySize: 12, reservationAdvanceDays: 60,
  }).returning({ id: restaurants.id, staffToken: restaurants.staffToken });

  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek: dow, startTime: "12:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 40,
    });
  }

  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, OWNER_EMAIL)).limit(1);
  if (owner) {
    await db.insert(restaurantMembers).values({ restaurantId: r.id, userId: owner.id, memberRole: "owner" });
  }

  const [sala] = await db.insert(floorSections).values({ restaurantId: r.id, label: "Sala 1" }).returning({ id: floorSections.id });
  const [terasa] = await db.insert(floorSections).values({ restaurantId: r.id, label: "Terasă" }).returning({ id: floorSections.id });

  const ids: Record<string, string> = {};
  for (const [label, sectionId] of [["m1", sala.id], ["m2", sala.id], ["m3", sala.id], ["t1", terasa.id], ["t2", terasa.id]] as const) {
    const [t] = await db.insert(floorTables).values({ restaurantId: r.id, label, sectionId }).returning({ id: floorTables.id });
    ids[label] = t.id;
  }

  const date = inDays(1);
  await db.insert(reservations).values({
    restaurantId: r.id, date, time: "19:00", partySize: 4,
    guestName: "Popescu Ana", guestPhone: "0740 111 222",
    status: "confirmed", turnMinutes: 90,
    floorTableIds: JSON.stringify([ids.m1, ids.m3]),
  });
  await db.insert(reservations).values({
    restaurantId: r.id, date, time: "20:00", partySize: 2,
    guestName: "Ionescu Dan", guestPhone: "0740 333 444",
    status: "confirmed", turnMinutes: 90,
  });
  await db.insert(reservations).values({
    restaurantId: r.id, date, time: "20:30", partySize: 2,
    guestName: "Marinescu Ioana", guestPhone: "0740 555 666",
    status: "confirmed", turnMinutes: 90,
  });

  const B = "http://localhost:3000";
  console.log(`\n✅ Demo „Plan de sală” — seeded on DEV (rezervări pe ${date}).`);
  console.log(owner ? `   Proprietar: ${OWNER_EMAIL}\n` : `   ⚠ ${OWNER_EMAIL} nu există în DEV — intri doar ca admin de platformă.\n`);
  console.log(`  Planul sălii:   ${B}/restaurant/${SLUG}/plan-sala`);
  console.log(`  Rezervări:      ${B}/restaurant/${SLUG}/rezervari`);
  console.log(`  Board personal: ${B}/s/${r.staffToken}`);
  console.log(`\n  Sala 1: m1, m2, m3   ·   Terasă: t1, t2`);
  console.log(`  19:00 Popescu   — deja pe m1 + m3 (le ține până la 20:30)`);
  console.log(`  20:00 Ionescu   — apasă „Mese”: m1 și m3 apar ocupate, cu numele lui Popescu`);
  console.log(`  20:30 Marinescu — apasă „Mese”: m1 și m3 sunt din nou libere`);
  console.log(`\n  Șterge demo-ul:  pnpm tsx scripts/seed-floor-plan-demo.ts --clean\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
