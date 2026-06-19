/**
 * Newsletter digest content — fetches a small curated PREVIEW of recent published
 * content per section (not the full week), plus the total count so the email can
 * show a "+N more" hint with a "Vezi toate" button. Composed once per send and
 * reused for every recipient.
 */
import { sql, and, eq, count, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsItems, events, places } from "@/lib/db/schema";

const PREVIEW_LIMIT = 5;

export interface DigestNewsItem {
  title: string;
  excerpt: string;
  category: string | null;
  slug: string;
  imageUrl: string | null;
}
export interface DigestEvent {
  title: string;
  slug: string;
  startsAt: Date;
  locationName: string | null;
  category: string | null;
  isFree: boolean | null;
  price: string | null;
  currency: string | null;
}
export interface DigestPlace {
  name: string;
  slug: string;
  category: string | null;
  address: string | null;
}

export interface Digest {
  news: { items: DigestNewsItem[]; total: number };
  events: { items: DigestEvent[]; total: number };
  places: { items: DigestPlace[]; total: number };
}

/** Recently published news within the window. */
async function getDigestNews(since: Date): Promise<Digest["news"]> {
  const where = and(eq(newsItems.status, "published"), gte(newsItems.publishedAt, since));
  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        title: newsItems.title,
        excerpt: newsItems.excerpt,
        category: newsItems.category,
        slug: newsItems.slug,
        imageUrl: newsItems.imageUrl,
      })
      .from(newsItems)
      .where(where)
      .orderBy(sql`${newsItems.publishedAt} DESC NULLS LAST`)
      .limit(PREVIEW_LIMIT),
    db.select({ total: count() }).from(newsItems).where(where),
  ]);
  return { items, total };
}

/** Upcoming published events (past events are useless in a newsletter). */
async function getDigestEvents(now: Date): Promise<Digest["events"]> {
  const where = and(eq(events.status, "published"), gte(events.startsAt, now));
  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        title: events.title,
        slug: events.slug,
        startsAt: events.startsAt,
        locationName: events.locationName,
        category: events.category,
        isFree: events.isFree,
        price: events.price,
        currency: events.currency,
      })
      .from(events)
      .where(where)
      .orderBy(sql`${events.startsAt} ASC`)
      .limit(PREVIEW_LIMIT),
    db.select({ total: count() }).from(events).where(where),
  ]);
  return { items, total };
}

/** Newly added published places within the window. */
async function getDigestPlaces(since: Date): Promise<Digest["places"]> {
  const where = and(eq(places.status, "published"), gte(places.createdAt, since));
  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        name: places.name,
        slug: places.slug,
        category: places.category,
        address: places.address,
      })
      .from(places)
      .where(where)
      .orderBy(sql`${places.createdAt} DESC`)
      .limit(PREVIEW_LIMIT),
    db.select({ total: count() }).from(places).where(where),
  ]);
  return { items, total };
}

/**
 * Compose the full digest once. `since` defaults to 7 days ago (weekly window).
 */
export async function composeDigest({ since }: { since?: Date } = {}): Promise<Digest> {
  const now = new Date();
  const from = since ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [news, events, places] = await Promise.all([
    getDigestNews(from),
    getDigestEvents(now),
    getDigestPlaces(from),
  ]);
  return { news, events, places };
}
