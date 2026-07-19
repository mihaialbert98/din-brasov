/**
 * One-off reconciliation for the Localuri + Restaurante admin merge.
 *
 * Every restaurant should hang off a `places` row (placeId). Legacy restaurants
 * created before the merge have no place → they were invisible in the merged
 * Localuri list. This backfills a `places` row for each such restaurant and links
 * it. A restaurant that opted out of Localuri (showInLocaluri=false) gets a DRAFT
 * place (stays hidden from the public directory until an admin approves it); one
 * that opted in gets a PUBLISHED place.
 *
 * Idempotent, additive-only (never deletes, never unlinks). Dev DB via .env.local.
 * Run: pnpm tsx scripts/backfill-local-restaurant-links.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { restaurants, places } from "../lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { slugifyWithDate } from "../lib/slugify";

async function uniquePlaceSlug(name: string): Promise<string> {
  let slug = slugifyWithDate(name);
  for (let i = 0; i < 50; i++) {
    const [hit] = await db.select({ id: places.id }).from(places).where(eq(places.slug, slug)).limit(1);
    if (!hit) return slug;
    slug = `${slugifyWithDate(name)}-${i + 2}`;
  }
  return `${slugifyWithDate(name)}-${crypto.randomUUID().slice(0, 6)}`;
}

async function main() {
  const orphans = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      description: restaurants.description,
      address: restaurants.address,
      phone: restaurants.phone,
      cuisineType: restaurants.cuisineType,
      showInLocaluri: restaurants.showInLocaluri,
    })
    .from(restaurants)
    .where(isNull(restaurants.placeId));

  console.log(`Restaurants without a linked place: ${orphans.length}\n`);
  let created = 0;

  for (const r of orphans) {
    const slug = await uniquePlaceSlug(r.name);
    const status = r.showInLocaluri ? "published" : "draft";
    const [place] = await db
      .insert(places)
      .values({
        name: r.name,
        // places.description is NOT NULL — supply a minimal fallback.
        description: r.description ?? `${r.name} — local în Brașov.`,
        slug,
        category: "Restaurant",
        cuisineType: r.cuisineType ?? null,
        address: r.address ?? null,
        phone: r.phone ?? null,
        status,
      })
      .returning({ id: places.id });

    await db.update(restaurants).set({ placeId: place!.id, updatedAt: new Date() }).where(eq(restaurants.id, r.id));
    created++;
    console.log(`  ✓ ${r.name}  → place [${status}] /${slug}  (linked)`);
  }

  // Summary of the current landscape after backfill.
  const allRestaurants = await db
    .select({ name: restaurants.name, placeId: restaurants.placeId, showInLocaluri: restaurants.showInLocaluri })
    .from(restaurants);
  const allPlaces = await db.select({ name: places.name, status: places.status }).from(places);

  console.log(`\nBackfill complete: ${created} place(s) created.`);
  console.log(`\n=== Restaurants (all now linked?) ===`);
  for (const r of allRestaurants) console.log(`  ${r.name}  place=${r.placeId ? "LINKED" : "MISSING"}  localuri=${r.showInLocaluri}`);
  console.log(`\n=== Places (${allPlaces.length}) ===`);
  for (const p of allPlaces) console.log(`  [${p.status}] ${p.name}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
