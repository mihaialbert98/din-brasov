import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  restaurantTables,
  restaurants,
  menuCategories,
  menuItems,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import ServiceButtons from "@/components/restaurant/ServiceButtons";

type Props = { params: Promise<{ token: string }> };

/** Resolve table → restaurant from the unguessable QR token. */
async function getMenuContext(token: string) {
  const [table] = await db
    .select({
      tableId: restaurantTables.id,
      tableLabel: restaurantTables.label,
      restaurantId: restaurants.id,
      restaurantName: restaurants.name,
      restaurantStatus: restaurants.status,
      logoUrl: restaurants.logoUrl,
    })
    .from(restaurantTables)
    .innerJoin(restaurants, eq(restaurantTables.restaurantId, restaurants.id))
    .where(eq(restaurantTables.qrToken, token))
    .limit(1);
  return table ?? null;
}

export default async function ScannedMenuPage({ params }: Props) {
  const { token } = await params;
  const ctx = await getMenuContext(token);
  // Unknown token, or restaurant suspended → not found (no menu shown).
  if (!ctx || ctx.restaurantStatus !== "active") notFound();

  const [categories, items] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.restaurantId, ctx.restaurantId))
      .orderBy(asc(menuCategories.position)),
    db
      .select()
      .from(menuItems)
      .where(
        and(
          eq(menuItems.restaurantId, ctx.restaurantId),
          eq(menuItems.isAvailable, true)
        )
      )
      .orderBy(asc(menuItems.position)),
  ]);

  const grouped = categories
    .map((c) => ({
      ...c,
      items: items.filter((it) => it.categoryId === c.id),
    }))
    .filter((c) => c.items.length > 0); // hide empty categories from diners

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-28">
      <header className="text-center mb-6">
        {ctx.logoUrl && (
          <img src={ctx.logoUrl} alt="" className="w-16 h-16 rounded-full object-cover mx-auto mb-2" />
        )}
        <h1 className="text-2xl font-bold font-serif text-gray-900">{ctx.restaurantName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{ctx.tableLabel}</p>
      </header>

      {grouped.length === 0 ? (
        <p className="text-center text-gray-400 text-sm mt-12">Meniul nu este disponibil momentan.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map((cat) => (
            <section key={cat.id}>
              <h2 className="text-lg font-bold text-gray-900 border-b-2 border-[#c84b1e] pb-1 mb-3 inline-block">
                {cat.name}
              </h2>
              <ul className="space-y-3">
                {cat.items.map((it) => {
                  const allergens = it.allergens ? (JSON.parse(it.allergens) as string[]) : [];
                  return (
                    <li key={it.id} className="bg-white rounded-xl shadow-sm p-3 flex gap-3">
                      {it.imageUrl && (
                        <img src={it.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-gray-900">{it.name}</span>
                          {it.price && (
                            <span className="text-[#c84b1e] font-semibold whitespace-nowrap">{it.price} RON</span>
                          )}
                        </div>
                        {it.description && (
                          <p className="text-sm text-gray-500 mt-0.5">{it.description}</p>
                        )}
                        {allergens.length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">Alergeni: {allergens.join(", ")}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="text-center text-xs text-gray-400 mt-10">
        Meniu digital prin{" "}
        <span className="font-semibold">Din Brașov</span>
      </footer>

      <ServiceButtons token={token} />
    </div>
  );
}
