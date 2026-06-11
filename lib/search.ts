import { sql, and, eq, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsItems, events, listings, places } from "@/lib/db/schema";

const PAGE_SIZE = 20;

function searchQuery(query: string) {
  return sql`to_tsquery('simple', ${query
    .trim()
    .split(/\s+/)
    .map((w) => w + ":*")
    .join(" & ")})`;
}

export async function searchNews(
  query: string,
  { page = 1, category }: { page?: number; category?: string } = {}
) {
  const conditions = [eq(newsItems.status, "published")];
  if (category) conditions.push(eq(newsItems.category, category));
  if (query) {
    conditions.push(
      sql`${newsItems.searchVector} @@ ${searchQuery(query)}`
    );
  }

  return db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      excerpt: newsItems.excerpt,
      sourceUrl: newsItems.sourceUrl,
      sourceName: newsItems.sourceName,
      publishedAt: newsItems.publishedAt,
      imageUrl: newsItems.imageUrl,
      category: newsItems.category,
      slug: newsItems.slug,
    })
    .from(newsItems)
    .where(and(...conditions))
    .orderBy(sql`${newsItems.publishedAt} DESC NULLS LAST`)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
}

export async function searchEvents(
  query: string,
  { page = 1, category }: { page?: number; category?: string } = {}
) {
  const conditions = [eq(events.status, "published")];
  if (category) conditions.push(eq(events.category, category));
  if (query) {
    conditions.push(sql`${events.searchVector} @@ ${searchQuery(query)}`);
  }

  return db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      locationName: events.locationName,
      category: events.category,
      imageUrl: events.imageUrl,
      isFree: events.isFree,
      price: events.price,
      currency: events.currency,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(sql`${events.startsAt} ASC`)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
}

export type ListingSort = "newest" | "oldest" | "price_asc" | "price_desc";

function listingsSortClause(sort: ListingSort) {
  // Boosted always pinned first, then apply the user-chosen sort
  switch (sort) {
    case "oldest":
      return sql`${listings.isBoosted} DESC, ${listings.boostedUntil} DESC NULLS LAST, ${listings.createdAt} ASC`;
    case "price_asc":
      return sql`${listings.isBoosted} DESC, ${listings.boostedUntil} DESC NULLS LAST, CAST(NULLIF(REGEXP_REPLACE(${listings.price}, '[^0-9.]', '', 'g'), '') AS NUMERIC) ASC NULLS LAST`;
    case "price_desc":
      return sql`${listings.isBoosted} DESC, ${listings.boostedUntil} DESC NULLS LAST, CAST(NULLIF(REGEXP_REPLACE(${listings.price}, '[^0-9.]', '', 'g'), '') AS NUMERIC) DESC NULLS LAST`;
    case "newest":
    default:
      return sql`${listings.isBoosted} DESC, ${listings.boostedUntil} DESC NULLS LAST, ${listings.createdAt} DESC`;
  }
}

export async function searchListings(
  query: string,
  {
    page = 1,
    category,
    condition,
    sort = "newest",
  }: { page?: number; category?: string; condition?: string; sort?: ListingSort } = {}
) {
  const conditions = [eq(listings.status, "active")];
  if (category) conditions.push(eq(listings.category, category));
  if (condition) conditions.push(eq(listings.condition, condition));
  if (query) {
    conditions.push(sql`${listings.searchVector} @@ ${searchQuery(query)}`);
  }

  const [rows, [{ total }]] = await Promise.all([
    // Never return contact info in list — only in single-item endpoint
    db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        price: listings.price,
        currency: listings.currency,
        category: listings.category,
        condition: listings.condition,
        imagesJson: listings.imagesJson,
        location: listings.location,
        isAssisted: listings.isAssisted,
        isBoosted: listings.isBoosted,
        boostedUntil: listings.boostedUntil,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(and(...conditions))
      .orderBy(listingsSortClause(sort))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db.select({ total: count() }).from(listings).where(and(...conditions)),
  ]);

  return { listings: rows, total, pageSize: PAGE_SIZE };
}

export async function searchPlaces(
  query: string,
  { page = 1, category }: { page?: number; category?: string } = {}
) {
  const conditions = [eq(places.status, "published")];
  if (category) conditions.push(eq(places.category, category));
  if (query) {
    conditions.push(sql`${places.searchVector} @@ ${searchQuery(query)}`);
  }

  return db
    .select({
      id: places.id,
      name: places.name,
      slug: places.slug,
      category: places.category,
      address: places.address,
      imagesJson: places.imagesJson,
      createdAt: places.createdAt,
    })
    .from(places)
    .where(and(...conditions))
    .orderBy(sql`${places.createdAt} DESC`)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
}
