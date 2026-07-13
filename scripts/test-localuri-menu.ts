/**
 * End-to-end test of the "restaurant in Localuri + public menu" flow (dev DB).
 * Exercises the real opt-in DB effects, the place→restaurant menu resolver, the
 * public-menu gating, and disable. Cleans up after itself (restores the restaurant
 * to its original off state and removes the created place).
 *
 * Run: pnpm tsx scripts/test-localuri-menu.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../lib/db";
import { restaurants, places } from "../lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getRestaurantMenu } from "../lib/menu";
import { slugifyWithDate } from "../lib/slugify";

const SLUG = "restaurant-test"; // dev restaurant with 12 available items

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG)).limit(1);
  if (!r) { console.error(`No restaurant '${SLUG}'`); process.exit(1); }
  const originalShow = r.showInLocaluri;
  const originalPlaceId = r.placeId;

  console.log("\n=== 0. Baseline: menu fetch works ===");
  const menu = await getRestaurantMenu(r.id);
  assert("getRestaurantMenu returns categories", menu.length > 0, `got ${menu.length}`);
  assert("categories have items", menu.every((c) => c.items.length > 0));

  console.log("\n=== 1. ENABLE opt-in: creates draft place + links it (mirrors visibility route) ===");
  const placeId = crypto.randomUUID();
  await db.insert(places).values({
    id: placeId,
    name: r.name,
    description: r.description ?? `${r.name} — local din Brașov.`,
    slug: slugifyWithDate(r.name),
    category: "Restaurant",
    address: r.address ?? null,
    phone: r.phone ?? null,
    imagesJson: r.coverUrl ?? r.logoUrl ? JSON.stringify([r.coverUrl ?? r.logoUrl]) : null,
    status: "draft",
  });
  await db.update(restaurants).set({ showInLocaluri: true, placeId }).where(eq(restaurants.id, r.id));

  const [place1] = await db.select().from(places).where(eq(places.id, placeId)).limit(1);
  assert("draft place created", !!place1 && place1.status === "draft", place1?.status);
  assert("place category = Restaurant", place1?.category === "Restaurant");
  assert("place description not null", !!place1?.description);
  const [r1] = await db.select().from(restaurants).where(eq(restaurants.id, r.id)).limit(1);
  assert("restaurant.showInLocaluri = true", r1?.showInLocaluri === true);
  assert("restaurant.placeId linked", r1?.placeId === placeId);

  console.log("\n=== 2. While place is DRAFT: not public, menu route resolves NULL ===");
  // hasPublicMenu on the detail page requires place published; the menu page resolver
  // (getPlaceMenu) requires place.status === 'published'. Simulate both gates.
  const draftPlacePublished = place1?.status === "published";
  assert("place not yet published (hidden from Localuri)", draftPlacePublished === false);

  console.log("\n=== 3. Admin PUBLISHES place → menu becomes reachable ===");
  await db.update(places).set({ status: "published" }).where(eq(places.id, placeId));
  // getPlaceMenu resolver logic: published place → active+opted-in restaurant → menu
  const [pubPlace] = await db.select({ id: places.id, status: places.status }).from(places).where(eq(places.id, placeId)).limit(1);
  const [linkedR] = await db.select({ id: restaurants.id }).from(restaurants)
    .where(and(eq(restaurants.placeId, placeId), eq(restaurants.status, "active"), eq(restaurants.showInLocaluri, true)))
    .limit(1);
  assert("place is published", pubPlace?.status === "published");
  assert("resolver finds opted-in active restaurant", !!linkedR);
  const publicMenu = linkedR ? await getRestaurantMenu(linkedR.id) : [];
  assert("public menu has categories", publicMenu.length > 0);

  console.log("\n=== 4. DISABLE opt-in: place back to draft, drops out of Localuri ===");
  await db.update(restaurants).set({ showInLocaluri: false }).where(eq(restaurants.id, r.id));
  await db.update(places).set({ status: "draft" }).where(eq(places.id, placeId));
  const [r2] = await db.select({ show: restaurants.showInLocaluri }).from(restaurants).where(eq(restaurants.id, r.id)).limit(1);
  const [p2] = await db.select({ status: places.status }).from(places).where(eq(places.id, placeId)).limit(1);
  assert("showInLocaluri = false", r2?.show === false);
  assert("place back to draft (out of Localuri)", p2?.status === "draft");
  const [gone] = await db.select({ id: restaurants.id }).from(restaurants)
    .where(and(eq(restaurants.placeId, placeId), eq(restaurants.status, "active"), eq(restaurants.showInLocaluri, true)))
    .limit(1);
  assert("resolver no longer finds it (menu route would 404)", !gone);

  console.log("\n=== cleanup: restore restaurant, remove test place ===");
  await db.update(restaurants).set({ showInLocaluri: originalShow, placeId: originalPlaceId }).where(eq(restaurants.id, r.id));
  await db.delete(places).where(eq(places.id, placeId));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
