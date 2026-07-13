import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { newsItems, events, places, listings, experiences, restaurants } from "@/lib/db/schema";
import { eq, and, or, gt, isNull } from "drizzle-orm";
import { absoluteUrl } from "@/lib/seo";
import { CULTURE_HREF } from "@/lib/categories";

// Revalidate the sitemap hourly so new content gets discovered without a redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/stiri"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/evenimente"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    // Cultură is the events list pre-filtered to the culture category (its own destination).
    { url: absoluteUrl(CULTURE_HREF), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/experiente"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/localuri"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/anunturi"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/despre"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Pull every published/active entity directly (not the paginated search helpers).
  const [news, evts, plcs, lsts, exps, rests] = await Promise.all([
    db.select({ slug: newsItems.slug, updatedAt: newsItems.updatedAt })
      .from(newsItems).where(eq(newsItems.status, "published")),
    db.select({ slug: events.slug, updatedAt: events.updatedAt })
      .from(events).where(eq(events.status, "published")),
    db.select({ slug: places.slug, updatedAt: places.updatedAt })
      .from(places).where(eq(places.status, "published")),
    // Active, non-expired listings only. Expired/sold/removed naturally drop out.
    db.select({ slug: listings.slug, updatedAt: listings.updatedAt })
      .from(listings)
      .where(and(eq(listings.status, "active"), or(isNull(listings.expiresAt), gt(listings.expiresAt, now)))),
    db.select({ slug: experiences.slug, updatedAt: experiences.updatedAt })
      .from(experiences).where(eq(experiences.status, "published")),
    // Public menus of opted-in, active restaurants — keyed by their published place
    // slug (the menu lives at /localuri/[placeSlug]/meniu).
    db.select({ slug: places.slug, updatedAt: restaurants.updatedAt })
      .from(restaurants)
      .innerJoin(places, eq(restaurants.placeId, places.id))
      .where(and(
        eq(restaurants.status, "active"),
        eq(restaurants.showInLocaluri, true),
        eq(places.status, "published"),
      )),
  ]);

  const entityRoutes: MetadataRoute.Sitemap = [
    ...news.map((n) => ({ url: absoluteUrl(`/stiri/${n.slug}`), lastModified: n.updatedAt ?? now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...evts.map((e) => ({ url: absoluteUrl(`/evenimente/${e.slug}`), lastModified: e.updatedAt ?? now, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...plcs.map((p) => ({ url: absoluteUrl(`/localuri/${p.slug}`), lastModified: p.updatedAt ?? now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...lsts.map((l) => ({ url: absoluteUrl(`/anunturi/${l.slug}`), lastModified: l.updatedAt ?? now, changeFrequency: "daily" as const, priority: 0.6 })),
    ...exps.map((x) => ({ url: absoluteUrl(`/experiente/${x.slug}`), lastModified: x.updatedAt ?? now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...rests.map((r) => ({ url: absoluteUrl(`/localuri/${r.slug}/meniu`), lastModified: r.updatedAt ?? now, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];

  return [...staticRoutes, ...entityRoutes];
}
