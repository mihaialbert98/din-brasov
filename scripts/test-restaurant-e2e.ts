/**
 * Full restaurant lifecycle + multi-tenant isolation test (DEV DB, idempotent).
 *
 * Exercises the real library functions and DB operations for the whole flow:
 *   creation → enable capabilities → menu → tables/QR → QR service requests
 *   (table-service notifications) → reservations (settings, booking, board, status)
 *   → and the security-critical isolation:
 *     - a restaurant admin (owner) can manage ONLY their own restaurant
 *     - a different owner is blocked from someone else's restaurant
 *     - a plain user is blocked from all
 *     - a platform admin/moderator has full control over EVERY restaurant
 *
 * Run: pnpm tsx scripts/test-restaurant-e2e.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  users, places, restaurants, restaurantMembers, restaurantTables, serviceRequests,
  menuCategories, menuItems, reservationHours, reservations,
} from "../lib/db/schema";
import { eq, and, like, inArray, sql } from "drizzle-orm";
import {
  canManageRestaurant, canServeRestaurant, getUserRestaurants,
  isPlatformStaff, getMembership, uniqueRestaurantSlug,
} from "../lib/restaurant-permissions";
import { addNumberedTables } from "../lib/restaurant-tables";
import { validateBooking, createManualReservation, setReservationStatus, listUpcomingReservations } from "../lib/reservations";

const MARK = "@rest-e2e.test";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const section = (s: string) => console.log(`\n=== ${s} ===`);
function futureDateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (t.getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const u = await db.select({ id: users.id }).from(users).where(like(users.email, `%${MARK}`));
  const uids = u.map((x) => x.id);
  const p = await db.select({ id: places.id }).from(places).where(like(places.slug, `e2e-%`));
  const pids = p.map((x) => x.id);
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `e2e-%`));
  const rids = r.map((x) => x.id);
  if (rids.length) {
    await db.delete(serviceRequests).where(inArray(serviceRequests.restaurantId, rids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(menuItems).where(inArray(menuItems.restaurantId, rids));
    await db.delete(menuCategories).where(inArray(menuCategories.restaurantId, rids));
    await db.delete(restaurantTables).where(inArray(restaurantTables.restaurantId, rids));
    await db.delete(restaurantMembers).where(inArray(restaurantMembers.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  if (pids.length) await db.delete(places).where(inArray(places.id, pids));
  if (uids.length) await db.delete(users).where(inArray(users.id, uids));
}

async function mkUser(email: string, role: string) {
  const hash = await bcrypt.hash("Test1234!", 10);
  const [u] = await db.insert(users).values({ email, name: email.split("@")[0], password: hash, role, emailVerified: new Date(), gdprConsentAt: new Date() }).returning({ id: users.id });
  return u!.id;
}

async function main() {
  await cleanup();

  // Actors
  const ownerAId = await mkUser(`owner-a${MARK}`, "user");
  const ownerBId = await mkUser(`owner-b${MARK}`, "user");
  const plainId = await mkUser(`plain${MARK}`, "user");
  const adminId = await mkUser(`admin${MARK}`, "admin");
  const modId = await mkUser(`mod${MARK}`, "moderator");

  // ─────────────────────────────────────────────────────────────────────────
  section("1. Add a local (place only) — then enable restaurant capabilities");
  const [placeA] = await db.insert(places).values({
    name: "Local A E2E", description: "Local de test A pentru E2E.", slug: "e2e-local-a",
    category: "Restaurant", status: "published",
  }).returning({ id: places.id });
  ok(!!placeA, "place A created (directory-only local)");
  const [hasRestBefore] = await db.select().from(restaurants).where(eq(restaurants.placeId, placeA!.id)).limit(1);
  ok(!hasRestBefore, "local A has NO restaurant layer yet (directory-only)");

  // Enable restaurant layer (mirrors /api/admin/places/[id]/enable-restaurant)
  const slugA = await uniqueRestaurantSlug("Local A E2E");
  const [restA] = await db.insert(restaurants).values({
    name: "Local A E2E", slug: slugA.startsWith("e2e") ? slugA : `e2e-${slugA}`,
    placeId: placeA!.id, showInLocaluri: true, status: "active",
  }).returning({ id: restaurants.id, slug: restaurants.slug });
  ok(!!restA, "restaurant layer created + linked via placeId");
  const [linked] = await db.select({ placeId: restaurants.placeId }).from(restaurants).where(eq(restaurants.id, restA!.id));
  ok(linked?.placeId === placeA!.id, "restaurant.placeId points back at the local");

  // Second local for isolation tests
  const [placeB] = await db.insert(places).values({
    name: "Local B E2E", description: "Local de test B pentru E2E.", slug: "e2e-local-b",
    category: "Restaurant", status: "published",
  }).returning({ id: places.id });
  const [restB] = await db.insert(restaurants).values({
    name: "Local B E2E", slug: "e2e-local-b-rest", placeId: placeB!.id, showInLocaluri: true, status: "active",
  }).returning({ id: restaurants.id });

  // ─────────────────────────────────────────────────────────────────────────
  section("2. Assign owners (restaurant admins)");
  await db.insert(restaurantMembers).values({ restaurantId: restA!.id, userId: ownerAId, memberRole: "owner" });
  await db.insert(restaurantMembers).values({ restaurantId: restB!.id, userId: ownerBId, memberRole: "owner" });
  ok((await getMembership(ownerAId, restA!.id))?.memberRole === "owner", "owner A assigned to restaurant A");
  ok((await getMembership(ownerBId, restB!.id))?.memberRole === "owner", "owner B assigned to restaurant B");

  // ─────────────────────────────────────────────────────────────────────────
  section("3. Menu — categories + items");
  const [cat] = await db.insert(menuCategories).values({ restaurantId: restA!.id, name: "Preparate principale", position: 0 }).returning({ id: menuCategories.id });
  await db.insert(menuItems).values([
    { restaurantId: restA!.id, categoryId: cat!.id, name: "Ciorbă de burtă", price: "18", position: 0 },
    { restaurantId: restA!.id, categoryId: cat!.id, name: "Șnițel", price: "32", position: 1 },
  ]);
  const [{ items }] = await db.select({ items: sql<number>`count(*)::int` }).from(menuItems).where(eq(menuItems.restaurantId, restA!.id));
  ok(items === 2, "2 menu items created for restaurant A");

  // ─────────────────────────────────────────────────────────────────────────
  section("4. Tables + QR codes");
  const made = await addNumberedTables(restA!.id, 3);
  ok(made === 3, "3 numbered tables created");
  const tbls = await db.select({ id: restaurantTables.id, qrToken: restaurantTables.qrToken, label: restaurantTables.label }).from(restaurantTables).where(eq(restaurantTables.restaurantId, restA!.id));
  ok(tbls.length === 3 && tbls.every((t) => !!t.qrToken), "each table has a unique QR token");
  ok(new Set(tbls.map((t) => t.qrToken)).size === 3, "QR tokens are distinct");

  // ─────────────────────────────────────────────────────────────────────────
  section("5. QR service request (table-service notification)");
  // Simulate a diner tapping "Cheamă ospătarul" (mirrors /api/m/[token]/request logic).
  const table1 = tbls[0];
  await db.insert(serviceRequests).values({ restaurantId: restA!.id, tableId: table1.id, type: "call_waiter" });
  await db.insert(serviceRequests).values({ restaurantId: restA!.id, tableId: tbls[1].id, type: "request_check", paymentMethod: "card" });
  // The service board reads OPEN requests for THIS restaurant only.
  const boardA = await db.select().from(serviceRequests).where(eq(serviceRequests.restaurantId, restA!.id));
  ok(boardA.length === 2, "service board for A shows 2 open requests (call + check)");
  const boardB = await db.select().from(serviceRequests).where(eq(serviceRequests.restaurantId, restB!.id));
  ok(boardB.length === 0, "restaurant B's board shows NONE of A's requests (isolation)");
  // Waiter acknowledges → row deleted (transient queue).
  await db.delete(serviceRequests).where(eq(serviceRequests.id, boardA[0].id));
  const afterAck = await db.select().from(serviceRequests).where(eq(serviceRequests.restaurantId, restA!.id));
  ok(afterAck.length === 1, "acknowledging a request removes it from the live queue");

  // ─────────────────────────────────────────────────────────────────────────
  section("6. Reservations — settings, booking, board, status");
  // Enable reservations (both gates) + hours for every day.
  await db.update(restaurants).set({ reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true, reservationConfirmMode: "manual" }).where(eq(restaurants.id, restA!.id));
  for (let dow = 0; dow < 7; dow++) {
    await db.insert(reservationHours).values({ restaurantId: restA!.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });
  }
  // A public booking (validate then insert as pending — mirrors /api/reservations).
  const bookDate = futureDateForDow(5); // a Friday
  const v = await validateBooking(restA!.id, bookDate, "19:00", 4);
  ok(v.ok, "validateBooking accepts a valid slot");
  const [pub] = await db.insert(reservations).values({
    restaurantId: restA!.id, date: bookDate, time: "19:00", partySize: 4,
    guestName: "Client Public", guestPhone: "0722000000", guestEmail: `guest${MARK}`,
    userId: null, status: "pending",
  }).returning({ id: reservations.id });
  ok(!!pub, "public booking inserted as pending");
  // Staff manual booking (confirmed immediately).
  const man = await createManualReservation(restA!.id, { date: bookDate, time: "20:00", partySize: 2, guestName: "Telefon", guestPhone: "0722111111" }, false);
  ok(man.ok, "staff manual reservation created (confirmed)");
  // Board lists upcoming for A.
  const board = await listUpcomingReservations(restA!.id);
  ok(board.length >= 2, `reservations board shows upcoming for A (${board.length})`);
  // Owner confirms the pending one.
  await setReservationStatus(restA!.id, pub!.id, "confirmed");
  const [confd] = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, pub!.id));
  ok(confd?.status === "confirmed", "owner confirmed the pending reservation");
  // Isolation: reservations for B must not include A's.
  const [{ nB }] = await db.select({ nB: sql<number>`count(*)::int` }).from(reservations).where(eq(reservations.restaurantId, restB!.id));
  ok(nB === 0, "restaurant B has none of A's reservations (isolation)");

  // ─────────────────────────────────────────────────────────────────────────
  section("7. MULTI-TENANT ISOLATION (the security core)");
  // Owner A: full control of A, ZERO of B.
  ok(await canManageRestaurant(ownerAId, restA!.id, "user"), "owner A CAN manage restaurant A");
  ok(!(await canManageRestaurant(ownerAId, restB!.id, "user")), "owner A CANNOT manage restaurant B");
  ok(await canServeRestaurant(ownerAId, restA!.id, "user"), "owner A CAN serve (board) restaurant A");
  ok(!(await canServeRestaurant(ownerAId, restB!.id, "user")), "owner A CANNOT serve restaurant B");
  // Owner B: mirror.
  ok(await canManageRestaurant(ownerBId, restB!.id, "user"), "owner B CAN manage restaurant B");
  ok(!(await canManageRestaurant(ownerBId, restA!.id, "user")), "owner B CANNOT manage restaurant A");
  // Plain user: nothing.
  ok(!(await canManageRestaurant(plainId, restA!.id, "user")), "plain user CANNOT manage A");
  ok(!(await canManageRestaurant(plainId, restB!.id, "user")), "plain user CANNOT manage B");
  ok(!(await canServeRestaurant(plainId, restA!.id, "user")), "plain user CANNOT serve A");
  // getUserRestaurants scoping — each owner sees ONLY their own.
  const aList = await getUserRestaurants(ownerAId);
  ok(aList.length === 1 && aList[0].id === restA!.id, "owner A's restaurant list = [A] only");
  const bList = await getUserRestaurants(ownerBId);
  ok(bList.length === 1 && bList[0].id === restB!.id, "owner B's restaurant list = [B] only");
  ok((await getUserRestaurants(plainId)).length === 0, "plain user's restaurant list is empty");

  // Platform admin + moderator: full control of BOTH, no membership needed.
  ok(isPlatformStaff("admin") && isPlatformStaff("moderator"), "admin + moderator are platform staff");
  ok(await canManageRestaurant(adminId, restA!.id, "admin"), "platform ADMIN can manage A (no membership)");
  ok(await canManageRestaurant(adminId, restB!.id, "admin"), "platform ADMIN can manage B (no membership)");
  ok(await canManageRestaurant(modId, restA!.id, "moderator"), "platform MODERATOR can manage A");
  ok(await canManageRestaurant(modId, restB!.id, "moderator"), "platform MODERATOR can manage B");
  ok(await canServeRestaurant(adminId, restB!.id, "admin"), "platform ADMIN can serve any board");
  ok(!(await getMembership(adminId, restA!.id)), "platform admin has NO membership row (access is role-based, correct)");

  // ─────────────────────────────────────────────────────────────────────────
  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
