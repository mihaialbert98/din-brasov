import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { restaurantTables, menuItems, restaurantMembers } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getRestaurantBySlug } from "@/lib/restaurant-permissions";
import CuisineTypeInput from "@/components/restaurant/CuisineTypeInput";

export default async function RestaurantOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const [[{ tableCount }], [{ itemCount }], [{ staffCount }]] = await Promise.all([
    db.select({ tableCount: count() }).from(restaurantTables).where(eq(restaurantTables.restaurantId, restaurant.id)),
    db.select({ itemCount: count() }).from(menuItems).where(eq(menuItems.restaurantId, restaurant.id)),
    db.select({ staffCount: count() }).from(restaurantMembers).where(eq(restaurantMembers.restaurantId, restaurant.id)),
  ]);

  const stats = [
    { label: "Produse în meniu", value: itemCount, href: `/restaurant/${slug}/meniu` },
    { label: "Mese", value: tableCount, href: `/restaurant/${slug}/mese` },
    { label: "Membri echipă", value: staffCount, href: `/restaurant/${slug}/personal` },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
        {restaurant.status === "suspended" && (
          <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
            Suspendat — meniul nu este disponibil pentru clienți
          </span>
        )}
        {restaurant.address && <p className="text-gray-500 mt-1">{restaurant.address}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow"
          >
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      <CuisineTypeInput restaurantId={restaurant.id} initialValue={restaurant.cuisineType} />
    </div>
  );
}
