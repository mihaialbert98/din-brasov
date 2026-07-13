import { db } from "@/lib/db";
import { menuCategories, menuItems } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { type MenuViewCategory } from "@/components/restaurant/MenuView";
import { allergensToText } from "@/lib/text";

/**
 * Fetch a restaurant's full menu as MenuViewCategory[], ready for <MenuView>.
 *
 * Categories ordered by position; only available items included; empty categories
 * dropped. Shared by the QR table menu (`/m/[token]`) and the public read-only menu
 * (`/restaurant/[slug]/meniu`) so both render from one code path.
 */
export async function getRestaurantMenu(restaurantId: string): Promise<MenuViewCategory[]> {
  const [categories, items] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.restaurantId, restaurantId))
      .orderBy(asc(menuCategories.position)),
    db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isAvailable, true)))
      .orderBy(asc(menuItems.position)),
  ]);

  return categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      items: items
        .filter((it) => it.categoryId === c.id)
        .map((it) => ({
          id: it.id,
          name: it.name,
          nameEn: it.nameEn,
          description: it.description,
          descriptionEn: it.descriptionEn,
          price: it.price,
          imageUrl: it.imageUrl,
          allergens: allergensToText(it.allergens),
          allergensEn: it.allergensEn ?? "",
          calories: it.calories,
          isVegan: it.isVegan,
        })),
    }))
    .filter((c) => c.items.length > 0); // hide empty categories
}
