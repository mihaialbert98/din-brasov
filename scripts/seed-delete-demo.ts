/**
 * DEMO DATA for the "delete safely" work (DEV only): tables, join-groups and the
 * bookings that sit on them. Set up so each deletion has a DIFFERENT, visible outcome:
 *   - deleting Masa 3 → its guest is automatically MOVED to the free Masa 4
 *   - deleting Masa 1 → the 7-person group booking CAN'T be re-seated → reported
 *   - deleting the group "Masa 1–2" → existing booking keeps both tables, only future
 *     joins change (maxJoin is 1, so nothing can be joined without the group)
 *
 * Run:    pnpm tsx scripts/seed-delete-demo.ts
 * Undo:   pnpm tsx scripts/seed-delete-demo.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers } from "../lib/db/schema";
import { inArray, like } from "drizzle-orm";

const SLUG = "demo-mese";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tomorrow = iso(new Date(Date.now() + 86400000));

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${SLUG}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    const grps = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, ids));
    if (grps.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, grps.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, ids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, ids));
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

  const [pl] = await db.insert(places).values({
    name: "Taverna Mese (demo)", description: "Restaurant demonstrativ pentru mese, grupuri și ștergeri.",
    slug: SLUG, category: "Restaurant", address: "Str. Lungă 12, Brașov", status: "published",
  }).returning({ id: places.id });

  const [r] = await db.insert(restaurants).values({
    name: "Taverna Mese (demo)", slug: SLUG, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "auto", reservationCapacityMode: "tables", reservationAreasEnabled: false,
    reservationTurnMinutes: 90, reservationMaxJoin: 1, reservationMaxPartySize: 12,
  }).returning({ id: restaurants.id });

  // Open every day 18:00–22:00 so any test date works.
  await db.insert(reservationHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ restaurantId: r.id, dayOfWeek, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 13 })),
  );

  const T: Record<string, string> = {};
  for (const [label, seats, joinable] of [["Masa 1", 3, true], ["Masa 2", 4, true], ["Masa 3", 2, false], ["Masa 4", 4, false]] as const) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r.id, label, seats, joinable }).returning({ id: reservationTables.id });
    T[label] = t.id;
  }

  // The join-group: Masa 1 + Masa 2 (3 + 4 = 7 seats). maxJoin is 1, so this group is
  // the ONLY way a party bigger than one table can be seated.
  const [grp] = await db.insert(reservationTableGroups).values({ restaurantId: r.id, label: "Masa 1–2" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values([{ groupId: grp.id, tableId: T["Masa 1"] }, { groupId: grp.id, tableId: T["Masa 2"] }]);

  const base = { restaurantId: r.id, date: tomorrow, guestPhone: "0740 111 222", status: "confirmed" as const };
  await db.insert(reservations).values([
    { ...base, time: "19:00", partySize: 7, guestName: "Familia Pop (prin grup)", assignedTableIds: JSON.stringify([T["Masa 1"], T["Masa 2"]]) },
    { ...base, time: "19:00", partySize: 2, guestName: "Ionescu", assignedTableIds: JSON.stringify([T["Masa 3"]]) },
    { ...base, time: "20:30", partySize: 4, guestName: "Georgescu (mai târziu)", assignedTableIds: JSON.stringify([T["Masa 4"]]) },
  ]);

  console.log(`\n✅ Demo seeded on DEV — data: ${tomorrow}\n`);
  console.log(`Setări (mese + grupuri):  http://localhost:3000/restaurant/${SLUG}/rezervari-setari`);
  console.log(`Board rezervări:          http://localhost:3000/restaurant/${SLUG}/rezervari`);
  console.log(`Formular public:          http://localhost:3000/localuri/${SLUG}/rezervare`);
  console.log(`\nSala: Masa 1 (3p, se unește) · Masa 2 (4p, se unește) · Masa 3 (2p) · Masa 4 (4p)`);
  console.log(`Grup: „Masa 1–2". Mese maxime unite = 1 (deci doar grupul poate uni mese).`);
  console.log(`Rezervări mâine: 19:00 Familia Pop 7p [Masa 1 + Masa 2] · 19:00 Ionescu 2p [Masa 3] · 20:30 Georgescu 4p [Masa 4]`);
  console.log(`\nRemove it later:  pnpm tsx scripts/seed-delete-demo.ts --clean\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
