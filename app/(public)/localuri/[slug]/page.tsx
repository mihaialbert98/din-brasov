import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { MapPin, Phone, Globe, UtensilsCrossed, CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { places, restaurants, menuItems } from "@/lib/db/schema";
import type { Metadata } from "next";
import Badge from "@/components/ui/Badge";
import JsonLd from "@/components/seo/JsonLd";
import { pageMetadata, localBusinessJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { canReserve } from "@/lib/reservations";
import { mapsUrl } from "@/lib/maps";

type Props = { params: Promise<{ slug: string }> };

async function getPlace(slug: string) {
  const [item] = await db.select().from(places).where(eq(places.slug, slug)).limit(1);
  return item;
}

/**
 * If this place is a restaurant that opted into Localuri, report which public
 * actions to offer: "Vezi meniul" (has ≥1 available item) and "Rezervă o masă"
 * (reservations enabled + hours). Both live at the place's own URL.
 */
async function restaurantActions(placeId: string): Promise<{ menu: boolean; reserve: boolean }> {
  const [r] = await db
    .select({ id: restaurants.id, menuPublic: restaurants.menuPublic })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.placeId, placeId),
        eq(restaurants.status, "active"),
        eq(restaurants.showInLocaluri, true),
      )
    )
    .limit(1);
  if (!r) return { menu: false, reserve: false };

  // Menu button shows only if the owner has the public menu ON and there's ≥1 item.
  let menu = false;
  if (r.menuPublic) {
    const [item] = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, r.id), eq(menuItems.isAvailable, true)))
      .limit(1);
    menu = !!item;
  }

  return { menu, reserve: await canReserve(r.id) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlace(slug);
  if (!place || place.status !== "published") return { title: "Local negăsit" };
  const images: string[] = place.imagesJson ? JSON.parse(place.imagesJson) : [];
  return pageMetadata({
    title: place.name,
    description: place.description,
    path: `/localuri/${place.slug}`,
    image: images[0],
    section: "Localuri",
  });
}

export default async function LocalPage({ params }: Props) {
  const { slug } = await params;
  const place = await getPlace(slug);

  if (!place || place.status !== "published") notFound();

  const images: string[] = place.imagesJson ? JSON.parse(place.imagesJson) : [];
  const actions = await restaurantActions(place.id);

  return (
    <article className="max-w-2xl mx-auto px-4 py-10">
      <JsonLd
        data={[
          localBusinessJsonLd({
            name: place.name,
            description: place.description,
            path: `/localuri/${place.slug}`,
            category: place.category,
            address: place.address,
            phone: place.phone,
            website: place.website,
            image: images[0],
            latitude: place.latitude,
            longitude: place.longitude,
            // Restaurant enrichment — set when this local is a menu/reservations restaurant.
            isRestaurant: actions.menu || actions.reserve,
            cuisine: place.cuisineType,
            menuPath: actions.menu ? `/localuri/${place.slug}/meniu` : null,
            acceptsReservations: actions.reserve,
            reservePath: actions.reserve ? `/localuri/${place.slug}/rezervare` : null,
          }),
          breadcrumbJsonLd([
            { name: "Acasă", path: "/" },
            { name: "Localuri", path: "/localuri" },
            { name: place.name, path: `/localuri/${place.slug}` },
          ]),
        ]}
      />
      {images[0] && (
        <div className="relative w-full aspect-[16/9] rounded-2xl mb-6 overflow-hidden bg-cream/40">
          <Image src={images[0]} alt={place.name} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {place.category && (
          <Badge variant="category" category={place.category}>
            {place.category}
          </Badge>
        )}
        {place.cuisineType && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-cream/60 text-ink/70 border border-hairline">
            {place.cuisineType}
          </span>
        )}
      </div>
      <h1 className="text-3xl sm:text-4xl font-semibold font-serif text-ink mt-3 mb-4 leading-tight">{place.name}</h1>

      {(actions.menu || actions.reserve) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {actions.menu && (
            <Link
              href={`/localuri/${place.slug}/meniu`}
              className="inline-flex items-center gap-2 bg-accent text-white font-semibold px-5 py-3 rounded-xl hover:bg-accent-hover transition-colors"
            >
              <UtensilsCrossed className="w-5 h-5" aria-hidden />
              Vezi meniul
            </Link>
          )}
          {actions.reserve && (
            <Link
              href={`/localuri/${place.slug}/rezervare`}
              className="inline-flex items-center gap-2 border border-accent text-accent font-semibold px-5 py-3 rounded-xl hover:bg-accent/5 transition-colors"
            >
              <CalendarClock className="w-5 h-5" aria-hidden />
              Rezervă o masă
            </Link>
          )}
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-hairline p-5 mb-6 space-y-2.5 text-ink/80">
        {place.address && (() => {
          const href = mapsUrl({ address: place.address, name: place.name, latitude: place.latitude, longitude: place.longitude });
          const inner = (
            <>
              <MapPin className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
              <span>{place.address}</span>
            </>
          );
          return href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-accent transition-colors"
              title="Deschide în Google Maps"
            >
              {inner}
              <span className="text-xs text-accent whitespace-nowrap">Vezi pe hartă ↗</span>
            </a>
          ) : (
            <p className="flex items-center gap-2">{inner}</p>
          );
        })()}
        {place.phone && (
          <a href={`tel:${place.phone}`} className="flex items-center gap-2 hover:text-accent transition-colors">
            <Phone className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
            <span>{place.phone}</span>
          </a>
        )}
        {place.website && (
          <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent hover:text-accent-hover transition-colors">
            <Globe className="w-4 h-4 flex-shrink-0" aria-hidden />
            <span className="truncate">{place.website}</span>
          </a>
        )}
      </div>

      <p className="text-ink/80 leading-relaxed whitespace-pre-wrap">{place.description}</p>
    </article>
  );
}
