/**
 * Menu admin: reordering categories / items and the dietary flags.
 *   - the public menu (getRestaurantMenu) renders in `position` order
 *   - reordering rewrites positions and the new order shows up immediately
 *   - reordering items is scoped to ONE category and one restaurant (no bleed)
 *   - vegan / vegetarian / „de post” round-trip, default to false on old rows, and
 *     vegan hides the separate vegetarian badge (most specific wins)
 * Replicates the PATCH routes' core (owned-ids filter + positions 0..n-1).
 * Throwaway restaurant (slug menuadm-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-menu-admin.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, menuCategories, menuItems } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { getRestaurantMenu } from "../lib/menu";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "menuadm-";

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(menuItems).where(inArray(menuItems.restaurantId, ids));
    await db.delete(menuCategories).where(inArray(menuCategories.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

/** What PATCH /menu/categories does: only own ids, positions 0..n-1 in the new order. */
async function reorderCategories(restaurantId: string, order: string[]) {
  const owned = new Set((await db.select({ id: menuCategories.id }).from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId))).map((c) => c.id));
  const ids = order.filter((c) => owned.has(c));
  await Promise.all(ids.map((cid, i) =>
    db.update(menuCategories).set({ position: i, updatedAt: new Date() })
      .where(and(eq(menuCategories.id, cid), eq(menuCategories.restaurantId, restaurantId)))));
}
/** What PATCH /menu/items does: scoped to one category of this restaurant. */
async function reorderItems(restaurantId: string, categoryId: string, order: string[]) {
  const owned = new Set((await db.select({ id: menuItems.id }).from(menuItems)
    .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.categoryId, categoryId)))).map((i) => i.id));
  const ids = order.filter((i) => owned.has(i));
  await Promise.all(ids.map((iid, i) =>
    db.update(menuItems).set({ position: i, updatedAt: new Date() })
      .where(and(eq(menuItems.id, iid), eq(menuItems.restaurantId, restaurantId)))));
}

async function main() {
  await cleanup();

  const [pl] = await db.insert(places).values({ name: "MenuAdm", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({ name: "MenuAdm", slug: `${P}r`, placeId: pl.id, status: "active" }).returning({ id: restaurants.id });

  // Three categories in creation order, each with items.
  const C: Record<string, string> = {};
  for (const [i, name] of ["Aperitive", "Fel principal", "Desert"].entries()) {
    const [c] = await db.insert(menuCategories).values({ restaurantId: r.id, name, position: i }).returning({ id: menuCategories.id });
    C[name] = c.id;
  }
  const I: Record<string, string> = {};
  for (const [i, name] of ["Bruschete", "Salată", "Supă"].entries()) {
    const [it] = await db.insert(menuItems).values({ restaurantId: r.id, categoryId: C["Aperitive"], name, position: i, isAvailable: true }).returning({ id: menuItems.id });
    I[name] = it.id;
  }
  const [other] = await db.insert(menuItems).values({ restaurantId: r.id, categoryId: C["Desert"], name: "Papanași", position: 0, isAvailable: true }).returning({ id: menuItems.id });
  // The public menu drops EMPTY categories, so give this one an item too.
  await db.insert(menuItems).values({ restaurantId: r.id, categoryId: C["Fel principal"], name: "Ciorbă", position: 0, isAvailable: true });

  const catNames = async () => (await getRestaurantMenu(r.id)).map((c) => c.name);
  const itemNames = async (cat: string) => ((await getRestaurantMenu(r.id)).find((c) => c.name === cat)?.items ?? []).map((i) => i.name);

  sec("1. Default order is creation order (by position)");
  ok((await catNames()).join(" > ") === "Aperitive > Fel principal > Desert", `categories: ${(await catNames()).join(" > ")}`);
  ok((await itemNames("Aperitive")).join(" > ") === "Bruschete > Salată > Supă", `items: ${(await itemNames("Aperitive")).join(" > ")}`);

  sec("2. Reordering categories (move Desert to the top)");
  await reorderCategories(r.id, [C["Desert"], C["Aperitive"], C["Fel principal"]]);
  ok((await catNames()).join(" > ") === "Desert > Aperitive > Fel principal", `new order: ${(await catNames()).join(" > ")}`);

  sec("3. Reordering items inside one category");
  await reorderItems(r.id, C["Aperitive"], [I["Supă"], I["Bruschete"], I["Salată"]]);
  ok((await itemNames("Aperitive")).join(" > ") === "Supă > Bruschete > Salată", `new order: ${(await itemNames("Aperitive")).join(" > ")}`);
  ok((await itemNames("Desert")).join() === "Papanași", "the other category is untouched");

  sec("4. Reorder is scoped — foreign ids are ignored");
  await reorderItems(r.id, C["Aperitive"], [other.id, I["Salată"], I["Supă"], I["Bruschete"]]);
  const scoped = await itemNames("Aperitive");
  ok(scoped.join(" > ") === "Salată > Supă > Bruschete", `an item from another category can't be injected — ${scoped.join(" > ")}`);
  const [desertPos] = await db.select({ p: menuItems.position, c: menuItems.categoryId }).from(menuItems).where(eq(menuItems.id, other.id));
  ok(desertPos.c === C["Desert"] && desertPos.p === 0, "…and that item stayed in its own category at its own position");

  sec("5. Dietary flags: default false, round-trip, most-specific badge");
  const fresh = (await getRestaurantMenu(r.id)).flatMap((c) => c.items).find((i) => i.name === "Papanași")!;
  ok(fresh.isVegan === false && fresh.isVegetarian === false && fresh.isFasting === false, "existing rows default to false for all three flags");

  await db.update(menuItems).set({ isVegan: true, isVegetarian: true }).where(eq(menuItems.id, I["Salată"]));
  await db.update(menuItems).set({ isVegetarian: true }).where(eq(menuItems.id, I["Supă"]));
  await db.update(menuItems).set({ isFasting: true }).where(eq(menuItems.id, I["Bruschete"]));
  const items = (await getRestaurantMenu(r.id)).flatMap((c) => c.items);
  const byName = (n: string) => items.find((i) => i.name === n)!;
  ok(byName("Salată").isVegan && byName("Salată").isVegetarian, "vegan + vegetarian persisted");
  ok(byName("Supă").isVegetarian && !byName("Supă").isVegan, "vegetarian-only persisted");
  ok(byName("Bruschete").isFasting && !byName("Bruschete").isVegan, "„de post” persisted independently of vegan");

  // Mirrors DietBadges: vegan wins over vegetarian; „de post” is additive.
  const badges = (i: { isVegan: boolean; isVegetarian: boolean; isFasting: boolean }) =>
    [i.isVegan ? "Vegan" : i.isVegetarian ? "Vegetarian" : null, i.isFasting ? "De post" : null].filter(Boolean).join("+");
  ok(badges(byName("Salată")) === "Vegan", "vegan dish shows only „Vegan” (not Vegetarian too)");
  ok(badges(byName("Supă")) === "Vegetarian", "vegetarian dish shows „Vegetarian”");
  ok(badges(byName("Bruschete")) === "De post", "fasting dish shows „De post”");

  await db.update(menuItems).set({ isVegan: true, isFasting: true }).where(eq(menuItems.id, I["Bruschete"]));
  const both = (await getRestaurantMenu(r.id)).flatMap((c) => c.items).find((i) => i.name === "Bruschete")!;
  ok(badges(both) === "Vegan+De post", "a dish can be both vegan and „de post”");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
