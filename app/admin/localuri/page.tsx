import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Localuri" };

export default async function AdminLocaluriPage() {
  const [drafts, published] = await Promise.all([
    db.select().from(places).where(eq(places.status, "draft")).orderBy(desc(places.createdAt)),
    db.select().from(places).where(eq(places.status, "published")).orderBy(desc(places.createdAt)).limit(10),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Localuri</h1>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">În așteptare ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="text-gray-400 text-sm">Nu există localuri de revizuit.</p>
        ) : (
          <div className="space-y-4">
            {drafts.map((place) => (
              <div key={place.id} className="bg-white rounded-xl p-5 shadow-sm flex flex-col gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {place.category && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{place.category}</span>}
                  </div>
                  <h2 className="font-semibold text-gray-900">{place.name}</h2>
                  {place.address && <p className="text-sm text-gray-500 mt-0.5">📍 {place.address}</p>}
                  {place.phone && <p className="text-sm text-gray-500">📞 {place.phone}</p>}
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{place.description}</p>
                </div>
                <div className="flex gap-3">
                  <form action={`/api/places/${place.id}/approve`} method="POST">
                    <button type="submit" className="bg-[#1a1a1a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                      ✓ Publică
                    </button>
                  </form>
                  <form action={`/api/places/${place.id}/reject`} method="POST">
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
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Localuri publicate</h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-600">Nume</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Categorie</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Adresă</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {published.map((place) => (
                  <tr key={place.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link href={`/localuri/${place.slug}`} target="_blank" className="font-medium hover:underline text-gray-900">
                        {place.name}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-500">{place.category ?? "—"}</td>
                    <td className="p-3 text-gray-500">{place.address ?? "—"}</td>
                    <td className="p-3 text-gray-400">{formatDate(place.createdAt, { day: "numeric", month: "short" })}</td>
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
