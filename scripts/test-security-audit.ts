/**
 * Security + integrity audit for the merged-admin + sliding-window reservation work.
 * DEV DB, idempotent. Probes the authorization helpers and booking math that the
 * new/changed API routes depend on — verifying no authz bypass, no cross-tenant
 * access, and no oversell through the sliding window.
 *
 * Run: pnpm tsx scripts/test-security-audit.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { users, places, restaurants, restaurantMembers, reservations, reservationHours } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import {
  authorizeReservationSettings, authorizeMenuEdit, canManageRestaurant, canServeRestaurant,
  canEditMenuNow, isPlatformStaff, getUserRestaurants,
} from "../lib/restaurant-permissions";
import { availableSlotsForDay, validateBooking } from "../lib/reservations";

const MARK = "@sec.test";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (t.getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "sec-%"));
  const rids = r.map((x) => x.id);
  const p = await db.select({ id: places.id }).from(places).where(like(places.slug, "sec-%"));
  const pids = p.map((x) => x.id);
  const u = await db.select({ id: users.id }).from(users).where(like(users.email, `%${MARK}`));
  const uids = u.map((x) => x.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurantMembers).where(inArray(restaurantMembers.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  if (pids.length) await db.delete(places).where(inArray(places.id, pids));
  if (uids.length) await db.delete(users).where(inArray(users.id, uids));
}
async function mkUser(email: string, role: string) {
  const hash = await bcrypt.hash("Test1234!", 10);
  const [u] = await db.insert(users).values({ email, name: email.split("@")[0], password: hash, role, emailVerified: new Date() }).returning({ id: users.id });
  return u!.id;
}

async function main() {
  await cleanup();

  const ownerA = await mkUser(`owner-a${MARK}`, "user");
  const ownerB = await mkUser(`owner-b${MARK}`, "user");
  const waiterA = await mkUser(`waiter-a${MARK}`, "user");
  const attacker = await mkUser(`attacker${MARK}`, "user");
  const admin = await mkUser(`admin${MARK}`, "admin");
  const mod = await mkUser(`mod${MARK}`, "moderator");

  const [pA] = await db.insert(places).values({ name: "Sec A", description: "sec test a", slug: "sec-a", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [pB] = await db.insert(places).values({ name: "Sec B", description: "sec test b", slug: "sec-b", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rA] = await db.insert(restaurants).values({ name: "Sec A", slug: "sec-a-r", placeId: pA!.id, status: "active", reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true, reservationTurnMinutes: 90, reservationMaxPartySize: 20 }).returning({ id: restaurants.id });
  const [rB] = await db.insert(restaurants).values({ name: "Sec B", slug: "sec-b-r", placeId: pB!.id, status: "active" }).returning({ id: restaurants.id });
  await db.insert(restaurantMembers).values({ restaurantId: rA!.id, userId: ownerA, memberRole: "owner" });
  await db.insert(restaurantMembers).values({ restaurantId: rB!.id, userId: ownerB, memberRole: "owner" });
  await db.insert(restaurantMembers).values({ restaurantId: rA!.id, userId: waiterA, memberRole: "waiter" });

  const S = (id: string) => ({ user: { id } });

  // ─────────────────────────────────────────────────────────────────────────
  sec("1. Reservation-settings authz (the turn-time endpoint gate)");
  ok("error" in (await authorizeReservationSettings(null, undefined, rA!.id)), "no session → 401 (blocked)");
  ok("error" in (await authorizeReservationSettings(S(attacker), "user", rA!.id)), "random user → blocked from A's settings");
  ok("error" in (await authorizeReservationSettings(S(ownerB), "user", rA!.id)), "owner of B → blocked from A's settings (cross-tenant)");
  ok("error" in (await authorizeReservationSettings(S(waiterA), "user", rA!.id)), "waiter of A → blocked from A's settings (not a manager)");
  ok(!("error" in (await authorizeReservationSettings(S(ownerA), "user", rA!.id))), "owner A → allowed on A's settings");
  ok(!("error" in (await authorizeReservationSettings(S(admin), "admin", rA!.id))), "platform admin → allowed (oversight)");
  ok(!("error" in (await authorizeReservationSettings(S(mod), "moderator", rB!.id))), "platform moderator → allowed on any");

  // ─────────────────────────────────────────────────────────────────────────
  sec("2. Menu-edit authz (the item-create gate)");
  // Owners need a 2FA unlock window → without it, 423 (locked), not open.
  const gOwnerNoUnlock = await authorizeMenuEdit(S(ownerA), "user", rA!.id);
  ok("error" in gOwnerNoUnlock && (gOwnerNoUnlock as any).status === 423, "owner without 2FA unlock → 423 locked (not open)");
  ok("error" in (await authorizeMenuEdit(S(ownerB), "user", rA!.id)) && (await authorizeMenuEdit(S(ownerB), "user", rA!.id) as any).status === 403, "owner of B → 403 on A's menu (cross-tenant)");
  ok("error" in (await authorizeMenuEdit(S(attacker), "user", rA!.id)), "random user → blocked from A's menu");
  ok(!("error" in (await authorizeMenuEdit(S(admin), "admin", rA!.id))), "platform admin → menu edit allowed (no 2FA)");
  ok(await canEditMenuNow(admin, rA!.id, "admin"), "canEditMenuNow true for platform admin");
  ok(!(await canEditMenuNow(ownerA, rA!.id, "user")), "canEditMenuNow false for owner without unlock");

  // ─────────────────────────────────────────────────────────────────────────
  sec("3. Cross-tenant management/isolation (merged-admin capabilities)");
  ok(await canManageRestaurant(ownerA, rA!.id, "user") && !(await canManageRestaurant(ownerA, rB!.id, "user")), "owner A manages only A");
  ok(await canServeRestaurant(waiterA, rA!.id, "user") && !(await canServeRestaurant(waiterA, rB!.id, "user")), "waiter A serves only A");
  ok(!(await canManageRestaurant(waiterA, rA!.id, "user")), "waiter A canNOT manage A (serve ≠ manage)");
  const listA = await getUserRestaurants(ownerA);
  ok(listA.length === 1 && listA[0].id === rA!.id, "owner A sees only restaurant A in their list");
  ok(await canManageRestaurant(admin, rB!.id, "admin") && await canManageRestaurant(mod, rA!.id, "moderator"), "platform staff manage BOTH");
  ok(isPlatformStaff("admin") && isPlatformStaff("moderator") && !isPlatformStaff("user") && !isPlatformStaff(undefined), "isPlatformStaff correct for all roles");

  // ─────────────────────────────────────────────────────────────────────────
  sec("4. Sliding window prevents OVERSELL (no seat reuse within turn)");
  const dow = 4, date = dateForDow(dow);
  await db.insert(reservationHours).values({ restaurantId: rA!.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 15, seatsPerSlot: 10 });
  // Fill 10/10 at 19:00 → window [19:00,20:30) fully booked.
  await db.insert(reservations).values({ restaurantId: rA!.id, date, time: "19:00", partySize: 10, guestName: "Full", guestPhone: "0700000001", status: "confirmed" });
  const slots = await availableSlotsForDay(rA!.id, date, 1);
  ok(!slots.includes("19:00") && !slots.includes("19:45") && !slots.includes("20:15"), "no start inside [19:00,20:30) offered when full (no oversell)");
  ok(slots.includes("20:30"), "20:30 opens exactly when the window ends");
  // Server re-check blocks an oversell attempt even if a client posts a stale time.
  ok(!(await validateBooking(rA!.id, date, "20:00", 1)).ok, "validateBooking rejects a stale/overlapping oversell attempt");
  ok((await validateBooking(rA!.id, date, "20:30", 10)).ok, "validateBooking allows a legitimate booking after the window");

  // ─────────────────────────────────────────────────────────────────────────
  sec("5. Party-cap + turn boundaries can't be bypassed");
  ok(!(await validateBooking(rA!.id, date, "18:00", 21)).ok, "party over max (21 > 20) rejected");
  ok(!(await validateBooking(rA!.id, date, "12:00", 2)).ok, "time outside hours rejected");
  ok(!(await validateBooking(rA!.id, date, "18:07", 2)).ok, "off-grid start time (18:07) rejected");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
