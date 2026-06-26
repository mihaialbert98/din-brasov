import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import ScrapePanel from "@/components/admin/ScrapePanel";
import PublishedNewsTable from "@/components/admin/PublishedNewsTable";
import DeleteAllPendingButton from "@/components/admin/DeleteAllPendingButton";
import DraftReviewGrid, { type DraftCard } from "@/components/admin/DraftReviewGrid";
import Pagination from "@/components/ui/Pagination";
import { normalizeTitle } from "@/lib/text";

export const metadata: Metadata = { title: "Admin — Știri" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DRAFTS_PER_PAGE = 12;
const PUBLISHED_PER_PAGE = 20;
const NEW_BATCH_WINDOW_MS = 60 * 60 * 1000; // 1h — drafts from the latest scrape

function daysUntilExpiry(createdAt: Date | null): number {
  if (!createdAt) return 0;
  const expiresAt = new Date(createdAt).getTime() + 3 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function buildHref(params: Record<string, string | undefined>, key: string, page: number) {
  const next = { ...params, [key]: String(page) };
  const qs = Object.entries(next)
    .filter(([, v]) => v !== undefined && v !== "1")
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return `/admin/stiri${qs ? `?${qs}` : ""}`;
}

interface Props {
  searchParams: Promise<{ dp?: string; pp?: string }>;
}

export default async function AdminStiriPage({ searchParams }: Props) {
  const params = await searchParams;
  const draftPage = Math.max(1, parseInt(params.dp ?? "1"));
  const pubPage = Math.max(1, parseInt(params.pp ?? "1"));

  const [[{ draftTotal }], [{ pubTotal }], drafts, published, publishedTitleRows, scrapeAgg] = await Promise.all([
    db.select({ draftTotal: count() }).from(newsItems).where(eq(newsItems.status, "draft")),
    db.select({ pubTotal: count() }).from(newsItems).where(eq(newsItems.status, "published")),
    db.select().from(newsItems).where(eq(newsItems.status, "draft"))
      .orderBy(desc(newsItems.createdAt))
      .limit(DRAFTS_PER_PAGE)
      .offset((draftPage - 1) * DRAFTS_PER_PAGE),
    db.select().from(newsItems).where(eq(newsItems.status, "published"))
      .orderBy(desc(newsItems.publishedAt))
      .limit(PUBLISHED_PER_PAGE)
      .offset((pubPage - 1) * PUBLISHED_PER_PAGE),
    // All published titles → duplicate detection against the draft set.
    db.select({ title: newsItems.title }).from(newsItems).where(eq(newsItems.status, "published")),
    // Latest scrape time across ALL drafts → "newly scraped" batch boundary.
    db.select({ scrapedAt: newsItems.scrapedAt }).from(newsItems).where(eq(newsItems.status, "draft")),
  ]);

  const draftTotalPages = Math.ceil(draftTotal / DRAFTS_PER_PAGE);
  const pubTotalPages = Math.ceil(pubTotal / PUBLISHED_PER_PAGE);

  const hasOldItems = published.some(
    (i) => i.publishedAt != null && new Date(i.publishedAt).getTime() < Date.now() - THIRTY_DAYS_MS
  );

  // Duplicate detection: a draft whose normalized title matches a published one.
  const publishedTitleSet = new Set(publishedTitleRows.map((r) => normalizeTitle(r.title)));
  const latestScrape = scrapeAgg.reduce<number>((max, r) => {
    const t = r.scrapedAt ? new Date(r.scrapedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  const draftCards: DraftCard[] = drafts.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: item.excerpt,
    sourceName: item.sourceName,
    category: item.category,
    imageUrl: item.imageUrl,
    daysUntilExpiry: daysUntilExpiry(item.createdAt),
    isDuplicate: publishedTitleSet.has(normalizeTitle(item.title)),
    isNewBatch:
      item.scrapedAt != null &&
      new Date(item.scrapedAt).getTime() >= latestScrape - NEW_BATCH_WINDOW_MS,
  }));

  const currentParams = { dp: params.dp, pp: params.pp };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Știri</h1>
        <Link
          href="/admin/stiri/nou"
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d9603a] transition-colors"
        >
          + Adaugă știre
        </Link>
      </div>

      <ScrapePanel />

      {/* Draft queue */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-700">
            În așteptare ({draftTotal})
          </h2>
          <DeleteAllPendingButton count={draftTotal} />
        </div>
        {draftTotal === 0 ? (
          <p className="text-gray-400 text-sm">Nu există știri de revizuit.</p>
        ) : (
          <>
            <DraftReviewGrid drafts={draftCards} draftPage={draftPage} />
            <Pagination
              currentPage={draftPage}
              totalPages={draftTotalPages}
              buildHref={(p) => buildHref(currentParams, "dp", p)}
            />
          </>
        )}
      </section>

      {/* Published news */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          Publicate ({pubTotal})
        </h2>
        {pubTotal === 0 ? (
          <p className="text-gray-400 text-sm">Nu există știri publicate.</p>
        ) : (
          <>
            <PublishedNewsTable items={published} hasOldItems={hasOldItems} />
            <Pagination
              currentPage={pubPage}
              totalPages={pubTotalPages}
              buildHref={(p) => buildHref(currentParams, "pp", p)}
            />
          </>
        )}
      </section>
    </div>
  );
}
