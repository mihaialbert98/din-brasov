/**
 * Set up a manual tenant-isolation demo (DEV DB, idempotent).
 *
 * Gives NextDoor a SEPARATE owner so you can prove in the browser that:
 *   - owner of Bistro (mihai...+owner) manages ONLY Bistro, gets 404 on NextDoor
 *   - owner of NextDoor (this new account) manages ONLY NextDoor, 404 on Bistro
 *   - the platform admin (mihai.albert.ioan) manages BOTH
 *
 * Run: pnpm tsx scripts/seed-isolation-demo.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { restaurants, restaurantMembers, users } from "../lib/db/schema";
import { and, eq } from "drizzle-orm";

const NEXTDOOR_OWNER = "owner.nextdoor@iso.test";
const BISTRO_OWNER = "mihai.albert.ioan+owner@gmail.com";
const PASSWORD = "Test1234!";

async function main() {
  // Separate owner account for NextDoor.
  let [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, NEXTDOOR_OWNER)).limit(1);
  if (!u) {
    const hash = await bcrypt.hash(PASSWORD, 10);
    [u] = await db.insert(users).values({
      email: NEXTDOOR_OWNER, name: "Proprietar NextDoor", password: hash,
      role: "user", emailVerified: new Date(), gdprConsentAt: new Date(),
    }).returning({ id: users.id });
  }

  const [nextdoor] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, "nextdoor")).limit(1);
  const [bistro] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, "restaurant-test")).limit(1);
  if (!nextdoor || !bistro) { console.error("Missing nextdoor/restaurant-test. Run seed-reservations-e2e first."); process.exit(1); }

  // Remove the shared owner from NextDoor so it's owned ONLY by the new account.
  const [bistroOwner] = await db.select({ id: users.id }).from(users).where(eq(users.email, BISTRO_OWNER)).limit(1);
  if (bistroOwner) {
    await db.delete(restaurantMembers).where(and(
      eq(restaurantMembers.restaurantId, nextdoor.id), eq(restaurantMembers.userId, bistroOwner.id),
    ));
  }
  // Ensure the new account owns NextDoor (idempotent).
  const [already] = await db.select({ id: restaurantMembers.id }).from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, nextdoor.id), eq(restaurantMembers.userId, u.id))).limit(1);
  if (!already) {
    await db.insert(restaurantMembers).values({ restaurantId: nextdoor.id, userId: u.id, memberRole: "owner" });
  }

  console.log("✓ Isolation demo ready (DEV DB).\n");
  console.log("── Owner A (Bistro only) ──");
  console.log(`   ${BISTRO_OWNER} / ${PASSWORD}`);
  console.log("   → /restaurant/restaurant-test works; /restaurant/nextdoor → 404\n");
  console.log("── Owner B (NextDoor only) ──");
  console.log(`   ${NEXTDOOR_OWNER} / ${PASSWORD}`);
  console.log("   → /restaurant/nextdoor works; /restaurant/restaurant-test → 404\n");
  console.log("── Platform admin (both) ──");
  console.log("   mihai.albert.ioan@gmail.com / Test1234!");
  console.log("   → both dashboards work; /admin/localuri shows both locals");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
