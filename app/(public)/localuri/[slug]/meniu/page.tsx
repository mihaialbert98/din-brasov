import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, MapPin } from "lucide-react";
import { eq, and } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { restaurants, places } from "@/lib/db/schema";
import { getRestaurantMenu } from "@/lib/menu";
import { canReserve } from "@/lib/reservations";
import { resolveTheme, themeStyle } from "@/lib/menu-themes";
import PublicMenuView from "@/components/restaurant/PublicMenuView";
import JsonLd from "@/components/seo/JsonLd";
import { pageMetadata, localBusinessJsonLd, breadcrumbJsonLd, menuJsonLd } from "@/lib/seo";
import { mapsUrl } from "@/lib/maps";

type Props = { params: Promise<{ slug: string }> };

/**
 * Resolve a published Localuri place slug → its opted-in, active restaurant (the
 * one that offers a public menu). The public menu lives under the place's URL so
 * it stays in the Localuri namespace the visitor is browsing.
 */
async function getPlaceMenu(slug: string) {
  const [place] = await db
    .select({
      id: places.id, name: places.name, slug: places.slug, status: places.status,
      address: places.address, latitude: places.latitude, longitude: places.longitude,
    })
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
      menuPublic: restaurants.menuPublic,
      cuisineType: restaurants.cuisineType,
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
  if (!restaurant || !restaurant.menuPublic) return null;

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
  const mapsHref = mapsUrl({
    address: place.address,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
  });

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
            isRestaurant: true,
            cuisine: restaurant.cuisineType,
            menuPath: `/localuri/${place.slug}/meniu`,
            acceptsReservations: reservable,
            reservePath: reservable ? `/localuri/${place.slug}/rezervare` : null,
          }),
          menuJsonLd({
            restaurantName: place.name,
            menuPath: `/localuri/${place.slug}/meniu`,
            categories,
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
        <div className="flex items-center gap-4">
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent transition-colors"
              title="Deschide în Google Maps"
            >
              <MapPin className="w-4 h-4" aria-hidden />
              Vezi pe hartă
            </a>
          )}
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
