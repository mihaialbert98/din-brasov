import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { eq, and } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { restaurants, places } from "@/lib/db/schema";
import { getRestaurantMenu } from "@/lib/menu";
import { canReserve } from "@/lib/reservations";
import { resolveTheme, themeStyle } from "@/lib/menu-themes";
import PublicMenuView from "@/components/restaurant/PublicMenuView";
import JsonLd from "@/components/seo/JsonLd";
import { pageMetadata, localBusinessJsonLd, breadcrumbJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

/**
 * Resolve a published Localuri place slug → its opted-in, active restaurant (the
 * one that offers a public menu). The public menu lives under the place's URL so
 * it stays in the Localuri namespace the visitor is browsing.
 */
async function getPlaceMenu(slug: string) {
  const [place] = await db
    .select({ id: places.id, name: places.name, slug: places.slug, status: places.status })
    .from(places)
    .where(eq(places.slug, slug))
    .limit(1);
  if (!place || place.status !== "published") return null;

  const [restaurant] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      description: restaurants.description,
      logoUrl: restaurants.logoUrl,
      coverUrl: restaurants.coverUrl,
      menuDesign: restaurants.menuDesign,
      menuTheme: restaurants.menuTheme,
    })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.placeId, place.id),
        eq(restaurants.status, "active"),
        eq(restaurants.showInLocaluri, true),
      )
    )
    .limit(1);
  if (!restaurant) return null;

  return { place, restaurant };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPlaceMenu(slug);
  if (!data) return { title: "Meniu negăsit" };
  const { place, restaurant } = data;
  return pageMetadata({
    title: `Meniu — ${place.name}`,
    description: restaurant.description ?? `Vezi meniul de la ${place.name} din Brașov.`,
    path: `/localuri/${place.slug}/meniu`,
    image: restaurant.coverUrl ?? restaurant.logoUrl ?? undefined,
    section: "Localuri",
  });
}

export default async function PlaceMenuPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPlaceMenu(slug);
  if (!data) notFound();
  const { place, restaurant } = data;

  const categories = await getRestaurantMenu(restaurant.id);
  const { design, theme } = resolveTheme(restaurant.menuDesign, restaurant.menuTheme);
  const reservable = await canReserve(restaurant.id);

  return (
    <div>
      <JsonLd
        data={[
          localBusinessJsonLd({
            name: place.name,
            description: restaurant.description ?? `Meniul de la ${place.name} din Brașov.`,
            path: `/localuri/${place.slug}/meniu`,
            category: "Restaurant",
            image: restaurant.coverUrl ?? restaurant.logoUrl,
          }),
          breadcrumbJsonLd([
            { name: "Acasă", path: "/" },
            { name: "Localuri", path: "/localuri" },
            { name: place.name, path: `/localuri/${place.slug}` },
            { name: "Meniu", path: `/localuri/${place.slug}/meniu` },
          ]),
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 pt-6 flex items-center justify-between gap-3">
        <Link
          href={`/localuri/${place.slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Înapoi la {place.name}
        </Link>
        {reservable && (
          <Link
            href={`/localuri/${place.slug}/rezervare`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            <CalendarClock className="w-4 h-4" aria-hidden />
            Rezervă o masă
          </Link>
        )}
      </div>

      {categories.length === 0 ? (
        <p className="max-w-3xl mx-auto px-4 py-16 text-center text-muted">
          Meniul nu este disponibil momentan.
        </p>
      ) : (
        <div className="menu-theme mt-4" style={themeStyle(theme) as React.CSSProperties}>
          <PublicMenuView
            design={design.id}
            restaurantName={restaurant.name}
            logoUrl={restaurant.logoUrl}
            coverUrl={restaurant.coverUrl}
            categories={categories}
          />
        </div>
      )}
    </div>
  );
}
