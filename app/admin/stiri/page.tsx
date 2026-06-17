import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import ScrapePanel from "@/components/admin/ScrapePanel";
import PublishedNewsTable from "@/components/admin/PublishedNewsTable";
import DraftDeleteButton from "@/components/admin/DraftDeleteButton";
import Pagination from "@/components/ui/Pagination";

export const metadata: Metadata = { title: "Admin — Știri" };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DRAFTS_PER_PAGE = 12;
const PUBLISHED_PER_PAGE = 20;

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
  searchParams: Promise<{ since?: string; dp?: string; pp?: string }>;
}

export default async function AdminStiriPage({ searchParams }: Props) {
  const params = await searchParams;
  const since = params.since;
  const sinceDate = since ? new Date(since) : null;
  const draftPage = Math.max(1, parseInt(params.dp ?? "1"));
  const pubPage = Math.max(1, parseInt(params.pp ?? "1"));

  const [[{ draftTotal }], [{ pubTotal }], drafts, published] = await Promise.all([
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
  ]);

  const draftTotalPages = Math.ceil(draftTotal / DRAFTS_PER_PAGE);
  const pubTotalPages = Math.ceil(pubTotal / PUBLISHED_PER_PAGE);

  const hasOldItems = published.some(
    (i) => i.publishedAt != null && new Date(i.publishedAt).getTime() < Date.now() - THIRTY_DAYS_MS
  );

  const currentParams = { since, dp: params.dp, pp: params.pp };

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
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          În așteptare ({draftTotal})
        </h2>
        {draftTotal === 0 ? (
          <p className="text-gray-400 text-sm">Nu există știri de revizuit.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {drafts.map((item) => {
                const days = daysUntilExpiry(item.createdAt);
                const isNew = sinceDate !== null &&
                  (item.scrapedAt ?? item.createdAt) !== null &&
                  new Date(item.scrapedAt ?? item.createdAt!).getTime() >= sinceDate.getTime();

                return (
                  <Link
                    key={item.id}
                    href={`/admin/stiri/${item.id}`}
                    className="relative bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
                  >
                    {isNew && (
                      <span className="absolute top-2 left-2 z-10 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        Nou
                      </span>
                    )}
                    <DraftDeleteButton id={item.id} title={item.title} />
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="w-full h-32 object-cover" />
                    )}
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#c84b1e] uppercase">{item.sourceName}</span>
                        {item.category && <span className="text-xs text-gray-400">· {item.category}</span>}
                      </div>
                      <h2 className="font-semibold text-gray-900 text-sm line-clamp-3">{item.title}</h2>
                      <p className="text-xs text-gray-500 line-clamp-2">{item.excerpt}</p>
                      <div className="mt-auto pt-2 flex items-center justify-between">
                        <span className={`text-xs font-medium ${days <= 1 ? "text-red-500" : "text-gray-400"}`}>
                          Expiră în {days} {days === 1 ? "zi" : "zile"}
                        </span>
                        <span className="text-xs text-[#c84b1e] font-medium">Revizuiește →</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
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
