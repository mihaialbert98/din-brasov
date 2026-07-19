/**
 * Headless test for Item 6: linkAnonReservations(userId, email).
 * Verifies an anonymous booking is claimed by a matching email on signup/confirm,
 * that a different email does NOT claim it, and that an already-owned reservation
 * is never re-assigned (WHERE user_id IS NULL guard). DEV DB only. Idempotent.
 *
 * Run: pnpm tsx scripts/test-anon-backlink.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { restaurants, reservations, users } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { linkAnonReservations } from "../lib/reservations";

const SLUG = "restaurant-test";
const MARK = "@backlink.test";
const MATCH = `booker${MARK}`;
const OTHER = `someone-else${MARK}`;
const OWNED = `already-owned${MARK}`;

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.log(`  ✗ ${msg}`); failed++; }
}
function day(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG)).limit(1);
  if (!r) { console.error(`No '${SLUG}'. Run seed-reservations-e2e first.`); process.exit(1); }

  // ── clean ──
  await db.delete(reservations).where(like(reservations.guestEmail, `%${MARK}`));
  const priorU = await db.select({ id: users.id }).from(users).where(like(users.email, `%${MARK}`));
  if (priorU.length) await db.delete(users).where(inArray(users.id, priorU.map((u) => u.id)));

  // The "new user" who will register/confirm with MATCH (case varied to test lower()).
  const [newUser] = await db.insert(users).values({
    email: MATCH, name: "Booker", emailVerified: new Date(), role: "user",
  }).returning({ id: users.id });
  // A pre-existing user who already owns their reservation.
  const [owner] = await db.insert(users).values({
    email: OWNED, name: "Owner", emailVerified: new Date(), role: "user",
  }).returning({ id: users.id });

  // Anon reservation matching MATCH (mixed case to prove case-insensitive match).
  const [anon] = await db.insert(reservations).values({
    restaurantId: r.id, date: day(3), time: "19:00", partySize: 2,
    guestName: "Anon", guestPhone: "0722000001", guestEmail: "BOOKER@backlink.test", userId: null, status: "pending",
  }).returning({ id: reservations.id });
  // Anon reservation with a DIFFERENT email — must never be claimed by MATCH.
  const [other] = await db.insert(reservations).values({
    restaurantId: r.id, date: day(3), time: "20:00", partySize: 2,
    guestName: "Other", guestPhone: "0722000002", guestEmail: OTHER, userId: null, status: "pending",
  }).returning({ id: reservations.id });
  // Reservation already owned by `owner`, but guest_email == MATCH — must NOT move.
  const [owned] = await db.insert(reservations).values({
    restaurantId: r.id, date: day(3), time: "21:00", partySize: 2,
    guestName: "Owned", guestPhone: "0722000003", guestEmail: MATCH, userId: owner.id, status: "confirmed",
  }).returning({ id: reservations.id });

  console.log("=== Item 6: anonymous → account backlink ===");

  // Act: the new user confirms with MATCH.
  await linkAnonReservations(newUser.id, MATCH);

  const [a] = await db.select().from(reservations).where(eq(reservations.id, anon.id));
  ok(a.userId === newUser.id, "matching anon reservation is claimed (case-insensitive)");

  const [o] = await db.select().from(reservations).where(eq(reservations.id, other.id));
  ok(o.userId === null, "non-matching anon reservation is NOT claimed");

  const [w] = await db.select().from(reservations).where(eq(reservations.id, owned.id));
  ok(w.userId === owner.id, "already-owned reservation is never re-assigned");

  // Idempotent second call changes nothing.
  await linkAnonReservations(newUser.id, MATCH);
  const [a2] = await db.select().from(reservations).where(eq(reservations.id, anon.id));
  ok(a2.userId === newUser.id, "re-running is idempotent (still owned by new user)");

  // ── cleanup ──
  await db.delete(reservations).where(inArray(reservations.id, [anon.id, other.id, owned.id]));
  await db.delete(users).where(inArray(users.id, [newUser.id, owner.id]));

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
