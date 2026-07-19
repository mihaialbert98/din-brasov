/**
 * Central SEO configuration + helpers — single source of truth for the site's
 * absolute URL, default metadata, OpenGraph image URLs, and JSON-LD builders.
 *
 * Base URL precedence:
 *  1. NEXT_PUBLIC_SITE_URL — set on Vercel Production to https://dinbrasov.com.
 *  2. VERCEL_URL — the deployment's own domain (auto-set on every Vercel build,
 *     incl. previews); needs an https:// prefix. Ensures preview QR codes / links
 *     point at the preview, not localhost.
 *  3. NEXTAUTH_URL — dev/other.
 *  4. localhost — local dev fallback.
 */
import type { Metadata } from "next";
import { INSTAGRAM_URL, FACEBOOK_URL } from "@/lib/contact";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  process.env.NEXTAUTH_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");

export const SITE_NAME = "Din Brașov";
export const SITE_DESCRIPTION =
  "Tot ce se întâmplă în Brașov — știri, evenimente, localuri și anunțuri.";
export const SITE_LOCALE = "ro_RO";

/** Absolute URL for a path (or pass an already-absolute URL through). */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Branded dynamic OG image URL (falls back when an entity has no image). */
export function ogImageUrl(opts: { title?: string; section?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.title) params.set("title", opts.title);
  if (opts.section) params.set("section", opts.section);
  const qs = params.toString();
  return absoluteUrl(`/og${qs ? `?${qs}` : ""}`);
}

/** Trim a description to a clean length for meta tags (no mid-word cuts). */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(" ", max) > 0 ? clean.lastIndexOf(" ", max) : max).trim() + "…";
}

/**
 * Build a complete Metadata object for a page: canonical + OpenGraph (FB/IG) +
 * minimal Twitter fallback. `image` is an absolute URL (entity image or OG route).
 */
export function pageMetadata(opts: {
  title?: string;
  description?: string;
  path: string; // canonical path, e.g. "/evenimente/concert-..."
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  section?: string; // for the OG fallback image label
}): Metadata {
  const description = opts.description ? metaDescription(opts.description) : SITE_DESCRIPTION;
  const url = absoluteUrl(opts.path);
  const image = opts.image ?? ogImageUrl({ title: opts.title, section: opts.section });

  return {
    title: opts.title,
    description,
    alternates: { canonical: opts.path },
    openGraph: {
      title: opts.title ? `${opts.title} | ${SITE_NAME}` : SITE_NAME,
      description,
      url,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      type: opts.type ?? "website",
      images: [{ url: image, width: 1200, height: 630 }],
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title ?? SITE_NAME,
      description,
      images: [image],
    },
  };
}

// ─── JSON-LD builders ─────────────────────────────────────────────────────────
// Each returns a plain object rendered by <JsonLd> as application/ld+json.

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/logo.png"),
    sameAs: [INSTAGRAM_URL, FACEBOOK_URL],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "ro-RO",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/anunturi?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

export function articleJsonLd(a: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  publishedAt?: Date | null;
  sourceName?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title,
    description: metaDescription(a.description),
    image: a.image ? [absoluteUrl(a.image)] : undefined,
    datePublished: a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined,
    mainEntityOfPage: absoluteUrl(a.path),
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") } },
    ...(a.sourceName ? { author: { "@type": "Organization", name: a.sourceName } } : {}),
  };
}

export function eventJsonLd(e: {
  title: string;
  description: string;
  path: string;
  startsAt: Date;
  endsAt?: Date | null;
  locationName?: string | null;
  address?: string | null;
  image?: string | null;
  isFree?: boolean | null;
  price?: string | null;
  currency?: string | null;
}) {
  const offers =
    e.isFree
      ? { "@type": "Offer", price: "0", priceCurrency: e.currency ?? "RON", availability: "https://schema.org/InStock", url: absoluteUrl(e.path) }
      : e.price
        ? { "@type": "Offer", price: e.price.replace(/[^0-9.]/g, "") || e.price, priceCurrency: e.currency ?? "RON", availability: "https://schema.org/InStock", url: absoluteUrl(e.path) }
        : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: metaDescription(e.description),
    startDate: new Date(e.startsAt).toISOString(),
    ...(e.endsAt ? { endDate: new Date(e.endsAt).toISOString() } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: e.image ? [absoluteUrl(e.image)] : undefined,
    location: {
      "@type": "Place",
      name: e.locationName ?? "Brașov",
      address: { "@type": "PostalAddress", streetAddress: e.address ?? undefined, addressLocality: "Brașov", addressCountry: "RO" },
    },
    ...(offers ? { offers } : {}),
    url: absoluteUrl(e.path),
  };
}

export function localBusinessJsonLd(p: {
  name: string;
  description: string;
  path: string;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  image?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  // Restaurant enrichment (all optional — set when the place is a restaurant that
  // opted into Localuri). Absent → plain LocalBusiness, unchanged behavior.
  isRestaurant?: boolean;
  cuisine?: string | null;
  menuPath?: string | null; // public menu URL → hasMenu (rich menu results)
  acceptsReservations?: boolean;
  reservePath?: string | null; // booking URL → ReserveAction ("Reserve" in search)
}) {
  const restaurant = !!p.isRestaurant;
  return {
    "@context": "https://schema.org",
    "@type": restaurant ? "Restaurant" : "LocalBusiness",
    name: p.name,
    description: metaDescription(p.description),
    image: p.image ? [absoluteUrl(p.image)] : undefined,
    address: { "@type": "PostalAddress", streetAddress: p.address ?? undefined, addressLocality: "Brașov", addressCountry: "RO" },
    ...(p.phone ? { telephone: p.phone } : {}),
    ...(p.website ? { sameAs: [p.website] } : {}),
    ...(p.latitude && p.longitude
      ? { geo: { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude } }
      : {}),
    ...(restaurant && p.cuisine ? { servesCuisine: p.cuisine } : {}),
    ...(restaurant && p.menuPath ? { hasMenu: absoluteUrl(p.menuPath) } : {}),
    ...(restaurant && p.acceptsReservations
      ? {
          acceptsReservations: "True",
          ...(p.reservePath
            ? {
                potentialAction: {
                  "@type": "ReserveAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: absoluteUrl(p.reservePath),
                    inLanguage: "ro-RO",
                    actionPlatform: [
                      "http://schema.org/DesktopWebPlatform",
                      "http://schema.org/MobileWebPlatform",
                    ],
                  },
                  result: { "@type": "Reservation", name: `Rezervare la ${p.name}` },
                },
              }
            : {}),
        }
      : {}),
    url: absoluteUrl(p.path),
  };
}

/**
 * Menu structured data for a restaurant's public menu page — Menu → MenuSection →
 * MenuItem, so Google can read individual dishes/prices. Built from the same
 * category/item data the page already renders (dynamic per restaurant).
 */
export function menuJsonLd(m: {
  restaurantName: string;
  menuPath: string;
  categories: { name: string; items: { name: string; description?: string | null; price?: string | null; currency?: string | null }[] }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: `Meniu — ${m.restaurantName}`,
    url: absoluteUrl(m.menuPath),
    hasMenuSection: m.categories.map((c) => ({
      "@type": "MenuSection",
      name: c.name,
      hasMenuItem: c.items.map((it) => ({
        "@type": "MenuItem",
        name: it.name,
        ...(it.description ? { description: metaDescription(it.description) } : {}),
        ...(it.price
          ? {
              offers: {
                "@type": "Offer",
                price: it.price.replace(/[^0-9.]/g, "") || it.price,
                priceCurrency: it.currency ?? "RON",
              },
            }
          : {}),
      })),
    })),
  };
}

export function productJsonLd(l: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  price?: string | null;
  currency?: string | null;
  category?: string | null;
  available?: boolean;
}) {
  const priceValue = l.price ? l.price.replace(/[^0-9.]/g, "") : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    description: metaDescription(l.description),
    image: l.image ? [absoluteUrl(l.image)] : undefined,
    ...(l.category ? { category: l.category } : {}),
    ...(priceValue
      ? {
          offers: {
            "@type": "Offer",
            price: priceValue,
            priceCurrency: l.currency ?? "RON",
            availability: l.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            areaServed: { "@type": "City", name: "Brașov" },
            url: absoluteUrl(l.path),
          },
        }
      : {}),
    url: absoluteUrl(l.path),
  };
}
