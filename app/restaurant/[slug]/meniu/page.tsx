import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";
import { menuCategories, menuItems, restaurantTables, places } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
  canEditMenuNow,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import MenuManager, { type MenuCategoryData } from "@/components/restaurant/MenuManager";
import { allergensToText } from "@/lib/text";

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
        isAvailable: it.isAvailable,
      })),
  }));

  // Admins bypass the 2FA lock; owners start locked unless within an active window.
  const isAdmin = isPlatformStaff(role);
  const initiallyUnlocked = isAdmin || (await canEditMenuNow(session.user.id, restaurant.id, role));

  // "See it as a customer" preview. Two possible targets, so the link works even
  // for a restaurant with no tables yet:
  //  1. the public Localuri menu (what a customer sees on the web) — when the
  //     restaurant is linked to a published place and opted into Localuri;
  //  2. otherwise any table's QR menu (what a diner at the table sees).
  const [firstTable] = await db
    .select({ qrToken: restaurantTables.qrToken })
    .from(restaurantTables)
    .where(eq(restaurantTables.restaurantId, restaurant.id))
    .orderBy(asc(restaurantTables.createdAt))
    .limit(1);

  const [linkedPlace] = restaurant.placeId
    ? await db
        .select({ slug: places.slug, status: places.status })
        .from(places)
        .where(eq(places.id, restaurant.placeId))
        .limit(1)
    : [];

  const publicMenuHref =
    linkedPlace && linkedPlace.status === "published" && restaurant.showInLocaluri && restaurant.menuPublic
      ? `/localuri/${linkedPlace.slug}/meniu`
      : null;
  const previewHref = publicMenuHref ?? (firstTable ? `/m/${firstTable.qrToken}` : null);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Meniu</h1>
        {previewHref ? (
          <Link
            href={previewHref}
            target="_blank"
            className="text-sm font-semibold text-[#c84b1e] border border-[#c84b1e] px-4 py-2 rounded-lg hover:bg-[#c84b1e]/5 transition-colors"
          >
            Vezi meniul ca un client ↗
          </Link>
        ) : (
          <span className="text-xs text-gray-400 max-w-xs text-right">
            Ca să previzualizezi meniul, adaugă o masă în „Mese &amp; QR” sau activează „Arată în
            Localuri” din Setări meniu.
          </span>
        )}
      </div>
      <MenuManager
        restaurantId={restaurant.id}
        initialCategories={data}
        requiresUnlock={!isAdmin}
        initiallyUnlocked={initiallyUnlocked}
      />
    </div>
  );
}
