/**
 * DEMO DATA for the v0.26.0 reservation features (DEV only):
 *   1. closed dates — a single closed day + a closed range (concediu)
 *   2. longer turn for large parties (from 5 people → 2h instead of 1h30),
 *      with the reduced-duration fallback ON, and bookings placed so a large party
 *      hits a 90-minute gap and sees a "până la …" slot
 *   3. one table held back for walk-ins, in "mese individuale" mode
 *
 * Two restaurants so both capacity modes are covered:
 *   demo-v26-mese   → mese individuale (held-back table, tables-mode gaps)
 *   demo-v26-locuri → capacitate totală (seat pool, reduced-duration slots)
 *
 * Run:    pnpm tsx scripts/seed-v26-demo.ts
 * Undo:   pnpm tsx scripts/seed-v26-demo.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationClosures } from "../lib/db/schema";
import { inArray, like } from "drizzle-orm";

const PREFIX = "demo-v26";

/** Local YYYY-MM-DD, `days` from today (never UTC — the whole flow is local). */
function inDays(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** The next occurrence of a weekday (not today), as local YYYY-MM-DD. */
function nextDow(dow: number): string {
  for (let i = 1; i <= 7; i++) {
    const t = new Date();
    t.setDate(t.getDate() + i);
    if (t.getDay() === dow) return inDays(i);
  }
  return inDays(1);
}

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${PREFIX}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(reservationClosures).where(inArray(reservationClosures.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${PREFIX}%`));
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing: DATABASE_URL is not the DEV branch.");
  }
  await clean();
  if (process.argv.includes("--clean")) { console.log("Demo data removed."); process.exit(0); }

  // Every weekday gets the same long dinner window, so any day you click works.
  const window = (restaurantId: string, seats: number) =>
    [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
      restaurantId, dayOfWeek, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: seats,
    }));

  // ── A. Mese individuale — held-back table + a tables-mode gap ────────────────
  const slugT = `${PREFIX}-mese`;
  const [plT] = await db.insert(places).values({
    name: "Trattoria Mese (demo v26)", description: "Demo: mese individuale, masă ținută pentru walk-in.",
    slug: slugT, category: "Restaurant", address: "Str. Republicii 12, Brașov", status: "published",
  }).returning({ id: places.id });
  const [rT] = await db.insert(restaurants).values({
    name: "Trattoria Mese (demo v26)", slug: slugT, placeId: plT.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "auto", reservationCapacityMode: "tables",
    reservationTurnMinutes: 90, reservationMaxPartySize: 12, reservationMaxJoin: 2,
    reservationLongTurnEnabled: true, reservationLongTurnFromParty: 5, reservationLongTurnMinutes: 120,
    reservationAllowReducedTurn: true, reservationShowDuration: true,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values(window(rT.id, 30));

  const tableIds: Record<string, string> = {};
  for (const [label, seats, joinable, online] of [
    ["Masa 1", 2, true, true],
    ["Masa 2", 4, true, true],
    ["Masa 3", 6, false, true],
    ["Masa 4", 6, false, true],
    ["Masa 5", 6, false, false], // held back for walk-ins
  ] as const) {
    const [t] = await db.insert(reservationTables).values({
      restaurantId: rT.id, label, seats, joinable, bookableOnline: online,
    }).returning({ id: reservationTables.id });
    tableIds[label] = t.id;
  }

  // Tomorrow at 20:00 every ONLINE table is taken (M1–M4). Only "Masa 5" — the one
  // held back for walk-ins — is still free, so the public form shows 20:00 as full
  // while the staff modal can still seat a party there. That's the whole point of
  // the feature, made visible in one click.
  const dT = inDays(1);
  await db.insert(reservations).values([
    { restaurantId: rT.id, date: dT, time: "17:00", partySize: 4, guestName: "Popescu Ana", guestPhone: "0740 111 222", status: "confirmed", turnMinutes: 90, assignedTableIds: JSON.stringify([tableIds["Masa 3"]]) },
    { restaurantId: rT.id, date: dT, time: "20:00", partySize: 5, guestName: "Ionescu Dan", guestPhone: "0740 333 444", status: "confirmed", turnMinutes: 120, assignedTableIds: JSON.stringify([tableIds["Masa 4"]]) },
    { restaurantId: rT.id, date: dT, time: "20:00", partySize: 4, guestName: "Georgescu Ilie", guestPhone: "0740 555 666", status: "confirmed", turnMinutes: 90, assignedTableIds: JSON.stringify([tableIds["Masa 3"]]) },
    { restaurantId: rT.id, date: dT, time: "20:00", partySize: 2, guestName: "Radu Vlad", guestPhone: "0740 777 888", status: "confirmed", turnMinutes: 90, assignedTableIds: JSON.stringify([tableIds["Masa 1"]]) },
    { restaurantId: rT.id, date: dT, time: "20:00", partySize: 4, guestName: "Stan Elena", guestPhone: "0740 999 000", status: "confirmed", turnMinutes: 90, assignedTableIds: JSON.stringify([tableIds["Masa 2"]]) },
  ]);

  // ── B. Capacitate totală — seat pool + closed dates ──────────────────────────
  const slugS = `${PREFIX}-locuri`;
  const [plS] = await db.insert(places).values({
    name: "Bistro Locuri (demo v26)", description: "Demo: capacitate totală, zile închise, durată pentru grupuri.",
    slug: slugS, category: "Restaurant", address: "Piața Sfatului 3, Brașov", status: "published",
  }).returning({ id: places.id });
  const [rS] = await db.insert(restaurants).values({
    name: "Bistro Locuri (demo v26)", slug: slugS, placeId: plS.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "manual", reservationCapacityMode: "seats",
    reservationTurnMinutes: 90, reservationMaxPartySize: 12,
    reservationLongTurnEnabled: true, reservationLongTurnFromParty: 5, reservationLongTurnMinutes: 120,
    reservationAllowReducedTurn: true, reservationShowDuration: true,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values(window(rS.id, 20));

  // Tomorrow: 16 of 20 seats taken 20:00–21:30 → only 4 spare across that block.
  // A party of 5 can't start at 19:00 (needs 2h, would overlap) but 18:30 comes back
  // as a reduced slot (90 min ends exactly at 20:00).
  const dS = inDays(1);
  await db.insert(reservations).values([
    { restaurantId: rS.id, date: dS, time: "20:00", partySize: 8, guestName: "Familia Marin", guestPhone: "0741 100 100", status: "confirmed", turnMinutes: 90 },
    { restaurantId: rS.id, date: dS, time: "20:00", partySize: 8, guestName: "Grup birou", guestPhone: "0741 200 200", status: "confirmed", turnMinutes: 90 },
  ]);

  // Closed: one single day (in 3 days) + a range (in 10–14 days).
  await db.insert(reservationClosures).values([
    { restaurantId: rS.id, dateFrom: inDays(3), dateTo: inDays(3), reason: "Eveniment privat" },
    { restaurantId: rS.id, dateFrom: inDays(10), dateTo: inDays(14), reason: "Concediu" },
  ]);
  // A booking that already exists on the closed day — proves closing never cancels.
  await db.insert(reservations).values({
    restaurantId: rS.id, date: inDays(3), time: "19:00", partySize: 4,
    guestName: "Rezervare pe ziua închisă", guestPhone: "0741 300 300", status: "confirmed", turnMinutes: 90,
  });

  const B = "http://localhost:3000";
  console.log(`\n✅ Demo v0.26.0 seeded on DEV.\n`);
  console.log(`── 1. ZILE ÎNCHISE ─────────────────────────────────────────`);
  console.log(`   Setări:  ${B}/restaurant/${slugS}/rezervari-setari   (card „Zile închise”)`);
  console.log(`   Client:  ${B}/localuri/${slugS}/rezervare`);
  console.log(`   • ${inDays(3)} (o zi) și ${inDays(10)}–${inDays(14)} (concediu) NU apar ca zile în formular.`);
  console.log(`   • Board: rezervarea de pe ${inDays(3)} există în continuare — închiderea nu anulează nimic.`);
  console.log(`   • Încearcă să închizi încă o zi care are rezervări → apare lista cu clienți de sunat.`);
  console.log(`\n── 2. DURATĂ MAI MARE PENTRU GRUPURI ───────────────────────`);
  console.log(`   Client:  ${B}/localuri/${slugS}/rezervare   → data de MÂINE (${dS})`);
  console.log(`   • 4 persoane → ora 19:00 apare normal (90 min).`);
  console.log(`   • 5 persoane → 19:00 DISPARE (are nevoie de 2h), dar 18:30 apare în`);
  console.log(`     secțiunea „pentru mai puțin timp — până la 20:00”. Asta e rezervarea salvată.`);
  console.log(`   • Sub butonul de trimitere vezi „Masa este rezervată …” (durata afișată).`);
  console.log(`\n── 3. MASĂ ȚINUTĂ PENTRU WALK-IN ───────────────────────────`);
  console.log(`   Setări:  ${B}/restaurant/${slugT}/rezervari-setari   (lista de mese)`);
  console.log(`   Board:   ${B}/restaurant/${slugT}/rezervari`);
  console.log(`   • „Masa 5” are eticheta „doar walk-in” → 18 locuri online · 6 pentru walk-in.`);
  console.log(`   • MÂINE (${dT}) la ora 20:00 toate mesele online (M1–M4) sunt ocupate:`);
  console.log(`     – Client (${B}/localuri/${slugT}/rezervare): 20:00 NU apare deloc.`);
  console.log(`     – Board → „Adaugă rezervare”, data ${dT}, ora 20:00, 4 persoane:`);
  console.log(`       preview-ul spune „Rezervarea încape. Masa: Masa 5” — tu vezi toată sala.`);
  console.log(`   • Tot în preview: cât e ocupat, câte mese sunt libere și ce durată va avea.`);
  console.log(`\nRemove it later:  pnpm tsx scripts/seed-v26-demo.ts --clean\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
