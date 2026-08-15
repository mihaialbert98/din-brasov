/**
 * Fixture for the browser (E2E) pass over the two table systems. DEV only.
 *
 * Creates a throwaway OWNER account with a known password (so the real login form can be
 * used, rather than faking a session) and two restaurants:
 *
 *   e2e-seats  „Capacitate totală” → Plan de sală: Sala 1 (m1,m2,m3) · Terasă (t1,t2)
 *              19:00 Popescu holds m1+m3 · 20:00 Ionescu · 20:30 Marinescu
 *   e2e-tables „Mese individuale”  → Masa 3 (4) · Masa 7 (6) · Masa 9 (8)
 *              19:00 Georgescu (6p, engine picks Masa 7) · 20:00 Vasile (4p)
 *
 * Prints the credentials and URLs the E2E script needs. Everything is prefixed e2e-tbl
 * so cleanup can't touch anything real.
 *
 * Run:    pnpm tsx scripts/seed-e2e-tables.ts
 * Undo:   pnpm tsx scripts/seed-e2e-tables.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  places, restaurants, restaurantMembers, reservations, reservationHours,
  reservationTables, floorSections, floorTables, users,
} from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";

const PREFIX = "e2e-tbl";
export const E2E_EMAIL = "e2e-tables@e2e.test";
export const E2E_PASSWORD = "E2eTables!2026";

function inDays(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${PREFIX}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(restaurantMembers).where(inArray(restaurantMembers.restaurantId, ids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(floorTables).where(inArray(floorTables.restaurantId, ids));
    await db.delete(floorSections).where(inArray(floorSections.restaurantId, ids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${PREFIX}%`));
  await db.delete(users).where(eq(users.email, E2E_EMAIL));
}

async function makeRestaurant(key: string, mode: "seats" | "tables", ownerId: string) {
  const slug = `${PREFIX}-${key}`;
  const name = mode === "seats" ? "E2E Capacitate (demo)" : "E2E Mese (demo)";
  const [pl] = await db.insert(places).values({
    name, description: "Fixture pentru testele de browser.", slug,
    category: "Restaurant", address: "Str. Republicii 1, Brașov", status: "published",
  }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name, slug, placeId: pl.id, status: "active", showInLocaluri: true,
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "manual",
    reservationCapacityMode: mode,
    reservationTurnMinutes: 90, reservationMaxPartySize: 20, reservationAdvanceDays: 60,
    reservationMaxJoin: 2,
  }).returning({ id: restaurants.id, staffToken: restaurants.staffToken });
  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek: dow, startTime: "12:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 60,
    });
  }
  await db.insert(restaurantMembers).values({ restaurantId: r.id, userId: ownerId, memberRole: "owner" });
  return { id: r.id, slug, staffToken: r.staffToken };
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing: DATABASE_URL is not the DEV branch.");
  }
  await clean();
  if (process.argv.includes("--clean")) { console.log("E2E fixture removed."); process.exit(0); }

  const [owner] = await db.insert(users).values({
    email: E2E_EMAIL, name: "E2E Owner",
    password: await bcrypt.hash(E2E_PASSWORD, 10), role: "user",
    // Credentials login is blocked until the address is confirmed. Set directly — this is
    // a dev fixture, and sending a real confirmation email to a fake address would be
    // both pointless and a cost.
    emailVerified: new Date(),
  }).returning({ id: users.id });

  const date = inDays(1);

  // ── „Capacitate totală” + Plan de sală ──
  const seats = await makeRestaurant("seats", "seats", owner.id);
  const [sala] = await db.insert(floorSections).values({ restaurantId: seats.id, label: "Sala 1" }).returning({ id: floorSections.id });
  const [terasa] = await db.insert(floorSections).values({ restaurantId: seats.id, label: "Terasă" }).returning({ id: floorSections.id });
  const fIds: Record<string, string> = {};
  for (const [label, sectionId] of [["m1", sala.id], ["m2", sala.id], ["m3", sala.id], ["t1", terasa.id], ["t2", terasa.id]] as const) {
    const [t] = await db.insert(floorTables).values({ restaurantId: seats.id, label, sectionId }).returning({ id: floorTables.id });
    fIds[label] = t.id;
  }
  await db.insert(reservations).values({
    restaurantId: seats.id, date, time: "19:00", partySize: 4,
    guestName: "Popescu Ana", guestPhone: "0740 111 222", status: "confirmed", turnMinutes: 90,
    floorTableIds: JSON.stringify([fIds.m1, fIds.m3]),
  });
  await db.insert(reservations).values({
    restaurantId: seats.id, date, time: "20:00", partySize: 2,
    guestName: "Ionescu Dan", guestPhone: "0740 333 444", status: "confirmed", turnMinutes: 90,
  });
  await db.insert(reservations).values({
    restaurantId: seats.id, date, time: "20:30", partySize: 2,
    guestName: "Marinescu Ioana", guestPhone: "0740 555 666", status: "confirmed", turnMinutes: 90,
  });

  // ── „Mese individuale” ──
  const tbl = await makeRestaurant("tables", "tables", owner.id);
  const cIds: Record<string, string> = {};
  // Masa 2 stays unbooked on purpose: a table that is FREE but too small, so the
  // „prea mică” state can be seen next to the „ocupată” one.
  for (const [label, sts] of [["Masa 2", 2], ["Masa 3", 4], ["Masa 7", 6], ["Masa 9", 8]] as const) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: tbl.id, label, seats: sts, joinable: true })
      .returning({ id: reservationTables.id });
    cIds[label] = t.id;
  }
  await db.insert(reservations).values({
    restaurantId: tbl.id, date, time: "19:00", partySize: 6,
    guestName: "Georgescu Vlad", guestPhone: "0740 777 888", status: "confirmed", turnMinutes: 90,
    assignedTableIds: JSON.stringify([cIds["Masa 7"]]),
  });
  await db.insert(reservations).values({
    restaurantId: tbl.id, date, time: "20:00", partySize: 4,
    guestName: "Vasile Radu", guestPhone: "0740 999 000", status: "confirmed", turnMinutes: 90,
    assignedTableIds: JSON.stringify([cIds["Masa 3"]]),
  });

  console.log(JSON.stringify({
    email: E2E_EMAIL, password: E2E_PASSWORD, date,
    seats: { slug: seats.slug, staffToken: seats.staffToken },
    tables: { slug: tbl.slug, staffToken: tbl.staffToken },
  }, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
