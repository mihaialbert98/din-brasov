import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Evenimente" };

export default async function AdminEvenimentePage() {
  const [drafts, published] = await Promise.all([
    db.select().from(events).where(eq(events.status, "draft")).orderBy(desc(events.createdAt)),
    db.select().from(events).where(eq(events.status, "published")).orderBy(desc(events.startsAt)).limit(10),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Evenimente</h1>
        <Link
          href="/admin/evenimente/nou"
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d9603a] transition-colors"
        >
          + Adaugă eveniment
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">În așteptare ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="text-gray-400 text-sm">Nu există evenimente de revizuit.</p>
        ) : (
          <div className="space-y-4">
            {drafts.map((ev) => (
              <div key={ev.id} className="bg-white rounded-xl p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {ev.category && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{ev.category}</span>}
                      <span className="text-xs text-gray-400">
                        {ev.startsAt ? formatDate(ev.startsAt) : "Fără dată"}
                      </span>
                    </div>
                    <h2 className="font-semibold text-gray-900">{ev.title}</h2>
                    {ev.locationName && <p className="text-sm text-gray-500 mt-0.5">📍 {ev.locationName}</p>}
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{ev.description}</p>
                  </div>
                  {ev.externalUrl && (
                    <Link href={ev.externalUrl} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-[#c84b1e] hover:underline whitespace-nowrap flex-shrink-0">
                      Link →
                    </Link>
                  )}
                </div>
                <div className="flex gap-3">
                  <form action={`/api/events/${ev.id}/approve`} method="POST">
                    <button type="submit" className="bg-[#1a1a1a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                      ✓ Publică
                    </button>
                  </form>
                  <form action={`/api/events/${ev.id}/reject`} method="POST">
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

      {published.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Evenimente publicate</h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-600">Titlu</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Data</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Locație</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Categorie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {published.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link href={`/evenimente/${ev.slug}`} target="_blank" className="font-medium hover:underline text-gray-900">
                        {ev.title}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-500">{ev.startsAt ? formatDate(ev.startsAt, { day: "numeric", month: "short" }) : "—"}</td>
                    <td className="p-3 text-gray-500">{ev.locationName ?? "—"}</td>
                    <td className="p-3 text-gray-500">{ev.category ?? "—"}</td>
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
