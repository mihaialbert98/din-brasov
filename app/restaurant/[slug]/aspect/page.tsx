import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, menuItems } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
  canEditMenuNow,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import AppearanceSettings from "@/components/restaurant/AppearanceSettings";
import LocaluriToggle from "@/components/restaurant/LocaluriToggle";
import { places } from "@/lib/db/schema";

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

  // Same 2FA gate as menu editing: admins bypass; owners need an active unlock window.
  const isAdmin = isPlatformStaff(role);
  const initiallyUnlocked = isAdmin || (await canEditMenuNow(session.user.id, restaurant.id, role));

  const [current] = await db
    .select({
      menuDesign: restaurants.menuDesign,
      menuTheme: restaurants.menuTheme,
      showInLocaluri: restaurants.showInLocaluri,
      menuPublic: restaurants.menuPublic,
      placeId: restaurants.placeId,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);

  // Localuri publication state: is the linked place already live for the public?
  const [linkedPlace] = current?.placeId
    ? await db.select({ status: places.status }).from(places).where(eq(places.id, current.placeId)).limit(1)
    : [undefined];
  const placePublished = linkedPlace?.status === "published";

  // Photo coverage — used to warn before switching to a photos-required design.
  const [{ total }] = await db.select({ total: count() }).from(menuItems).where(eq(menuItems.restaurantId, restaurant.id));
  const [{ withPhoto }] = await db
    .select({ withPhoto: count() })
    .from(menuItems)
    .where(sql`${menuItems.restaurantId} = ${restaurant.id} AND ${menuItems.imageUrl} IS NOT NULL AND ${menuItems.imageUrl} <> ''`);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Setări meniu</h1>
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
        initialLogoUrl={restaurant.logoUrl}
        initialCoverUrl={restaurant.coverUrl}
        requiresUnlock={!isAdmin}
        initiallyUnlocked={initiallyUnlocked}
      />

      <LocaluriToggle
        restaurantId={restaurant.id}
        initialEnabled={current?.showInLocaluri ?? false}
        placePublished={placePublished}
        initialMenuPublic={current?.menuPublic ?? true}
      />
    </div>
  );
}
