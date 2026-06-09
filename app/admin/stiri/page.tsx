import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Știri" };

export default async function AdminStiriPage() {
  const [drafts, published] = await Promise.all([
    db.select().from(newsItems).where(eq(newsItems.status, "draft")).orderBy(desc(newsItems.createdAt)),
    db.select().from(newsItems).where(eq(newsItems.status, "published")).orderBy(desc(newsItems.publishedAt)).limit(10),
  ]);

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

      {/* Draft queue */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          În așteptare ({drafts.length})
        </h2>
        {drafts.length === 0 ? (
          <p className="text-gray-400 text-sm">Nu există știri de revizuit.</p>
        ) : (
          <div className="space-y-4">
            {drafts.map((item) => (
              <div key={item.id} className="bg-white rounded-xl p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="w-full h-32 object-cover rounded-lg mb-2" />
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#c84b1e] uppercase">{item.sourceName}</span>
                      {item.category && <span className="text-xs text-gray-400">· {item.category}</span>}
                      <span className="text-xs text-gray-400">· {item.scrapedAt ? formatDate(item.scrapedAt, { day: "numeric", month: "short" }) : "manual"}</span>
                    </div>
                    <h2 className="font-semibold text-gray-900">{item.title}</h2>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.excerpt}</p>
                  </div>
                  <Link
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#c84b1e] hover:underline whitespace-nowrap flex-shrink-0"
                  >
                    Sursă →
                  </Link>
                </div>
                <div className="flex gap-3">
                  <form action={`/api/news/${item.id}/approve`} method="POST">
                    <button type="submit" className="bg-[#1a1a1a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                      ✓ Publică
                    </button>
                  </form>
                  <form action={`/api/news/${item.id}/reject`} method="POST">
                    <button type="submit" className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
                      ✗ Respinge
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recently published */}
      {published.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Publicate recent</h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-600">Titlu</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Sursă</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Categorie</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {published.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link href={`/stiri/${item.slug}`} className="font-medium hover:underline text-gray-900" target="_blank">
                        {item.title}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-500">{item.sourceName}</td>
                    <td className="p-3 text-gray-500">{item.category ?? "—"}</td>
                    <td className="p-3 text-gray-400">
                      {item.publishedAt ? formatDate(item.publishedAt, { day: "numeric", month: "short" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
