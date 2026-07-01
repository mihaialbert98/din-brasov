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
import MenuView, { type MenuViewCategory } from "@/components/restaurant/MenuView";

// Always render fresh so menu edits appear on the next scan of the same QR.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

/** Resolve table → restaurant from the unguessable QR token. */
async function getMenuContext(token: string) {
  const [table] = await db
    .select({
      tableId: restaurantTables.id,
      tableLabel: restaurantTables.label,
      tableActive: restaurantTables.isActive,
      restaurantId: restaurants.id,
      restaurantName: restaurants.name,
      restaurantStatus: restaurants.status,
      logoUrl: restaurants.logoUrl,
      coverUrl: restaurants.coverUrl,
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

  const grouped: MenuViewCategory[] = categories
    .map((c) => ({
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
        })),
    }))
    .filter((c) => c.items.length > 0); // hide empty categories from diners

  return (
    // .menu-theme carries the design tokens. A restaurant's brand color can be
    // injected here (style={{ '--brand': ... }}) without touching any component;
    // defaults to the platform brand.
    <div className="menu-theme min-h-screen">
      {grouped.length === 0 ? (
        <>
          <header className="px-5 pt-8 pb-8 text-center" style={{ background: "var(--brand)" }}>
            {ctx.logoUrl && (
              <img
                src={ctx.logoUrl}
                alt=""
                className="w-[72px] h-[72px] rounded-2xl object-cover mx-auto mb-3 ring-2 ring-white/70 shadow-md"
              />
            )}
            <h1 className="text-2xl sm:text-3xl font-serif font-bold" style={{ color: "var(--brand-contrast)" }}>
              {ctx.restaurantName}
            </h1>
            <p className="mt-1 text-[13px] font-medium tracking-wide" style={{ color: "color-mix(in srgb, var(--brand-contrast) 85%, transparent)" }}>
              {ctx.tableLabel}
            </p>
          </header>
          <p className="text-center text-sm mt-16 px-4" style={{ color: "var(--menu-faint)" }}>
            Meniul nu este disponibil momentan.
          </p>
        </>
      ) : (
        <MenuView
          restaurantName={ctx.restaurantName}
          tableLabel={ctx.tableLabel}
          logoUrl={ctx.logoUrl}
          coverUrl={ctx.coverUrl}
          categories={grouped}
        />
      )}

      <ServiceButtons token={token} disabled={!ctx.tableActive} />
    </div>
  );
}
