/**
 * DEMO DATA for the repeating notification chime (DEV only).
 *
 * Creates TWO restaurants so the rule that matters can be seen side by side:
 *
 *   demo-nudge-manual → confirmă MANUAL  → a pending reservation nudges every 15s
 *   demo-nudge-auto   → confirmă AUTOMAT → reservations NEVER nudge
 *
 * Both have QR tables, so a service request can be raised from a phone and the
 * service nudge (which applies to every restaurant) can be heard on each.
 *
 * Seeds one OPEN service request and — on the manual restaurant — one PENDING
 * reservation, so the chime starts on its own about 15 seconds after the staff
 * board is opened, with nothing to click first.
 *
 * Run:    pnpm tsx scripts/seed-nudge-demo.ts
 * Undo:   pnpm tsx scripts/seed-nudge-demo.ts --clean
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, restaurantTables, serviceRequests, reservations, reservationHours } from "../lib/db/schema";
import { inArray, like } from "drizzle-orm";

const PREFIX = "demo-nudge";

/** Local YYYY-MM-DD, `days` from today. */
function inDays(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function clean() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${PREFIX}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(serviceRequests).where(inArray(serviceRequests.restaurantId, ids));
    await db.delete(restaurantTables).where(inArray(restaurantTables.restaurantId, ids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${PREFIX}%`));
}

async function makeRestaurant(key: string, name: string, confirmMode: "auto" | "manual") {
  const slug = `${PREFIX}-${key}`;
  const [pl] = await db.insert(places).values({
    name, description: "Restaurant demonstrativ pentru notificările sonore.",
    slug, category: "Restaurant", address: "Str. Republicii 10, Brașov", status: "published",
  }).returning({ id: places.id });

  const [r] = await db.insert(restaurants).values({
    name, slug, placeId: pl.id, status: "active", showInLocaluri: true,
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: confirmMode,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
    reservationAdvanceDays: 60,
  }).returning({ id: restaurants.id, staffToken: restaurants.staffToken });

  // Open every day so a booking can always be made while testing.
  for (const dayOfWeek of [0, 1, 2, 3, 4, 5, 6]) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek, startTime: "12:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 30,
    });
  }

  // QR tables — scanning one of these is how a service request is raised.
  const tables: { label: string; qrToken: string }[] = [];
  for (const label of ["Masa 1", "Masa 2", "Masa 3"]) {
    const [t] = await db.insert(restaurantTables).values({ restaurantId: r.id, label })
      .returning({ label: restaurantTables.label, qrToken: restaurantTables.qrToken, id: restaurantTables.id });
    tables.push({ label: t.label, qrToken: t.qrToken });
    // One table already calling, so the nudge starts without any setup.
    if (label === "Masa 1") {
      await db.insert(serviceRequests).values({ restaurantId: r.id, tableId: t.id, type: "call_waiter" });
    }
  }

  return { id: r.id, slug, staffToken: r.staffToken, tables };
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing: DATABASE_URL is not the DEV branch.");
  }
  await clean();
  if (process.argv.includes("--clean")) { console.log("Demo data removed."); process.exit(0); }

  const manual = await makeRestaurant("manual", "Taverna Manual (demo)", "manual");
  const auto = await makeRestaurant("auto", "Bistro Auto (demo)", "auto");

  // A pending reservation on the MANUAL restaurant → this is what nudges.
  await db.insert(reservations).values({
    restaurantId: manual.id, date: inDays(1), time: "19:00", partySize: 4,
    guestName: "Popescu Ana", guestPhone: "0740 111 222", guestEmail: "ana@example.com",
    status: "pending", turnMinutes: 90,
  });
  // The same booking on AUTO lands confirmed — nothing is waiting on staff, so silent.
  await db.insert(reservations).values({
    restaurantId: auto.id, date: inDays(1), time: "19:00", partySize: 4,
    guestName: "Ionescu Dan", guestPhone: "0740 333 444", guestEmail: "dan@example.com",
    status: "confirmed", turnMinutes: 90,
  });

  const B = "http://localhost:3000";
  const line = (s: string) => console.log(s);

  line(`\n✅ Demo notificări sonore — seeded on DEV.\n`);
  line(`══ 1. MANUAL confirm — both nudges fire ═══════════════════════════`);
  line(`   Staff board (leave this open on the tablet):`);
  line(`     ${B}/s/${manual.staffToken}`);
  line(`   Already waiting: 1 service request (Masa 1) + 1 pending reservation.`);
  line(`   → Click once anywhere on the page first (browsers block sound until you do).`);
  line(`   → Within ~15s you should hear the chime, and again every 15s.`);
  line(`   → Accept the service request AND confirm the reservation → silence.`);
  line(``);
  line(`══ 2. AUTO confirm — service nudges, reservations DO NOT ══════════`);
  line(`   Staff board:  ${B}/s/${auto.staffToken}`);
  line(`   → The service request (Masa 1) nudges every 15s, same as above.`);
  line(`   → Accept it. Now the board is silent even though a booking exists —`);
  line(`     an auto-confirmed reservation needs no decision, so it never nudges.`);
  line(``);
  line(`══ 3. Raise a NEW service request (from a phone or a second tab) ══`);
  for (const t of manual.tables) {
    line(`   ${t.label.padEnd(8)} ${B}/m/${t.qrToken}`);
  }
  line(`   → Tap "Cheamă ospătarul". The staff board chimes, then every 15s.`);
  line(``);
  line(`══ 4. Make a NEW reservation (to hear the manual-confirm nudge) ═══`);
  line(`   ${B}/localuri/${manual.slug}/rezervare`);
  line(`   → It lands "În așteptare" and nudges until you confirm it.`);
  line(`   Compare: ${B}/localuri/${auto.slug}/rezervare  → confirmed instantly, silent.`);
  line(``);
  line(`   Tip: the tab may sit in the background — the chime still plays. Test that`);
  line(`   too, since that is how the tablet actually sits during service.`);
  line(`\nRemove it later:  pnpm tsx scripts/seed-nudge-demo.ts --clean\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
