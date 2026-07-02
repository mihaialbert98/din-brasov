import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, menuItems } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
} from "@/lib/restaurant-permissions";
import AppearanceSettings from "@/components/restaurant/AppearanceSettings";

export default async function AspectPage({
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

  const [current] = await db
    .select({ menuDesign: restaurants.menuDesign, menuTheme: restaurants.menuTheme })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);

  // Photo coverage — used to warn before switching to a photos-required design.
  const [{ total }] = await db.select({ total: count() }).from(menuItems).where(eq(menuItems.restaurantId, restaurant.id));
  const [{ withPhoto }] = await db
    .select({ withPhoto: count() })
    .from(menuItems)
    .where(sql`${menuItems.restaurantId} = ${restaurant.id} AND ${menuItems.imageUrl} IS NOT NULL AND ${menuItems.imageUrl} <> ''`);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Aspect meniu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Alege cum arată meniul pe care îl văd clienții când scanează codul QR. Poți schimba designul și
        paleta de culori oricând.
      </p>
      <AppearanceSettings
        restaurantId={restaurant.id}
        initialDesign={current?.menuDesign ?? "elegant"}
        initialTheme={current?.menuTheme ?? "terracotta"}
        totalItems={total}
        itemsWithPhoto={withPhoto}
      />
    </div>
  );
}
