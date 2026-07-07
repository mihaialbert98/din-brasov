import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  restaurantTables,
  restaurants,
  menuCategories,
  menuItems,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import ServiceButtons from "@/components/restaurant/ServiceButtons";
import MenuShell from "@/components/restaurant/MenuShell";
import { type MenuViewCategory } from "@/components/restaurant/MenuView";
import { resolveTheme, themeStyle } from "@/lib/menu-themes";
import { allergensToText } from "@/lib/text";

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
      menuDesign: restaurants.menuDesign,
      menuTheme: restaurants.menuTheme,
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

  // Invite only diners who aren't already members (page is force-dynamic, so this
  // session read is cheap and never cached across users).
  const session = await auth().catch(() => null);
  const showAccountCta = !session?.user;

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
    .filter((c) => c.items.length > 0); // hide empty categories from diners

  // Resolve the restaurant's chosen design + theme; theme tokens are applied as
  // CSS custom properties on the .menu-theme root, so every component follows.
  const { design, theme } = resolveTheme(ctx.menuDesign, ctx.menuTheme);

  return (
    <div className="menu-theme min-h-screen" style={themeStyle(theme) as React.CSSProperties}>
      {grouped.length === 0 ? (
        <>
          <header className="px-6 pt-11 pb-9 text-center" style={{ background: "var(--brand)" }}>
            {ctx.logoUrl && (
              <img
                src={ctx.logoUrl}
                alt=""
                className="w-[76px] h-[76px] rounded-full object-cover mx-auto mb-4 ring-1 shadow-md"
                style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--brand-contrast) 45%, transparent)" }}
              />
            )}
            <h1 className="text-[26px] sm:text-3xl font-serif font-medium leading-tight" style={{ color: "var(--brand-contrast)" }}>
              {ctx.restaurantName}
            </h1>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, var(--brand-contrast) 88%, transparent)" }}>
              {ctx.tableLabel}
            </p>
          </header>
          <p className="text-center text-sm mt-16 px-4" style={{ color: "var(--menu-faint)" }}>
            Meniul nu este disponibil momentan.
          </p>
          <ServiceButtons token={token} disabled={!ctx.tableActive} showAccountCta={showAccountCta} />
        </>
      ) : (
        <MenuShell
          token={token}
          tableActive={ctx.tableActive}
          design={design.id}
          restaurantName={ctx.restaurantName}
          tableLabel={ctx.tableLabel}
          logoUrl={ctx.logoUrl}
          coverUrl={ctx.coverUrl}
          categories={grouped}
          showAccountCta={showAccountCta}
        />
      )}
    </div>
  );
}
