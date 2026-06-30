import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories, menuItems } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
} from "@/lib/restaurant-permissions";
import MenuManager, { type MenuCategoryData } from "@/components/restaurant/MenuManager";

export default async function MeniuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const role = (session.user as any)?.role as string | undefined;
  if (!(await canManageRestaurant(session.user.id, restaurant.id, role))) notFound();

  const [categories, items] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.restaurantId, restaurant.id))
      .orderBy(asc(menuCategories.position)),
    db
      .select()
      .from(menuItems)
      .where(eq(menuItems.restaurantId, restaurant.id))
      .orderBy(asc(menuItems.position)),
  ]);

  const data: MenuCategoryData[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: items
      .filter((it) => it.categoryId === c.id)
      .map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        price: it.price,
        imageUrl: it.imageUrl,
        allergens: it.allergens ? (JSON.parse(it.allergens) as string[]) : [],
        isAvailable: it.isAvailable,
      })),
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Meniu</h1>
      <MenuManager restaurantId={restaurant.id} initialCategories={data} />
    </div>
  );
}
