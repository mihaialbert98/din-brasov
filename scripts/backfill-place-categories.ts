/**
 * Migrate legacy place categories to the canonical food/drink list.
 * Any place whose category is not one of PLACE_CATEGORIES (e.g. Magazin, Servicii,
 * Sănătate, Cultură) → "Altele". Places with no category are left as-is.
 * Idempotent, additive (only rewrites the category text). Dev DB via .env.local.
 *
 * Run on dev now; run the same on prod at release time.
 * Run: pnpm tsx scripts/backfill-place-categories.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { places } from "../lib/db/schema";
import { and, isNotNull, notInArray, eq } from "drizzle-orm";
import { PLACE_CATEGORIES } from "../lib/place-categories";

async function main() {
  // Preview which places would change.
  const stale = await db
    .select({ id: places.id, name: places.name, category: places.category })
    .from(places)
    .where(and(isNotNull(places.category), notInArray(places.category, PLACE_CATEGORIES as unknown as string[])));

  if (stale.length === 0) {
    console.log("✓ No legacy categories to migrate — all places already use the canonical list.");
    process.exit(0);
  }

  console.log(`Places with a non-canonical category (${stale.length}):`);
  for (const p of stale) console.log(`  ${p.name}: "${p.category}" → "Altele"`);

  await db
    .update(places)
    .set({ category: "Altele", updatedAt: new Date() })
    .where(and(isNotNull(places.category), notInArray(places.category, PLACE_CATEGORIES as unknown as string[])));

  // Report the resulting distribution.
  const all = await db.select({ category: places.category }).from(places);
  const counts = new Map<string, number>();
  for (const p of all) counts.set(p.category ?? "(fără)", (counts.get(p.category ?? "(fără)") ?? 0) + 1);
  console.log(`\n✓ Migrated ${stale.length} place(s). Category distribution now:`);
  for (const [c, n] of [...counts.entries()].sort()) console.log(`  ${c}: ${n}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
