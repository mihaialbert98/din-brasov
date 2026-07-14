import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import Pagination from "@/components/ui/Pagination";
import PlacesTable from "@/components/admin/PlacesTable";

export const metadata: Metadata = { title: "Admin — Localuri" };

const PER_PAGE = 20;

function buildHref(page: number) {
  return page === 1 ? "/admin/localuri" : `/admin/localuri?p=${page}`;
}

interface Props {
  searchParams: Promise<{ p?: string }>;
}

export default async function AdminLocaluriPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.p ?? "1"));

  const [[{ total }], published, pending] = await Promise.all([
    db.select({ total: count() }).from(places).where(eq(places.status, "published")),
    db.select().from(places).where(eq(places.status, "published"))
      .orderBy(desc(places.createdAt))
      .limit(PER_PAGE).offset((page - 1) * PER_PAGE),
    // Drafts awaiting admin approval (e.g. a restaurant that opted into Localuri).
    db.select().from(places).where(eq(places.status, "draft")).orderBy(desc(places.createdAt)),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Localuri ({total})</h1>
        <Link
          href="/admin/localuri/nou"
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d9603a] transition-colors"
        >
          + Adaugă local
        </Link>
      </div>

      {/* Pending approval — drafts (e.g. restaurants that opted into Localuri). */}
      {pending.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-amber-800 mb-1">
            În așteptarea aprobării ({pending.length})
          </h2>
          <p className="text-xs text-amber-700 mb-4">
            Localuri propuse — verifică și aprobă pentru a le publica în Localuri.
          </p>
          <div className="space-y-3">
            {pending.map((p) => {
              const img = (() => { try { return (JSON.parse(p.imagesJson ?? "[]") as string[])[0]; } catch { return null; } })();
              return (
                <div key={p.id} className="bg-white border border-amber-100 rounded-lg p-4 flex items-start gap-4">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      {p.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.category}</span>}
                    </div>
                    {p.address && <p className="text-sm text-gray-500 mt-0.5">{p.address}</p>}
                    {p.description && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.description}</p>}
                    <Link href={`/admin/localuri/${p.id}`} className="text-xs text-[#c84b1e] hover:underline mt-1 inline-block">
                      Vezi detalii
                    </Link>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <form action={`/api/places/${p.id}/approve`} method="POST">
                      <button type="submit" className="w-full text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                        Aprobă
                      </button>
                    </form>
                    <form action={`/api/places/${p.id}/reject`} method="POST">
                      <button type="submit" className="w-full text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        Respinge
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {total === 0 && pending.length === 0 ? (
        <p className="text-gray-400 text-sm">Nu există localuri. Adaugă primul!</p>
      ) : total > 0 ? (
        <>
          <h2 className="text-base font-semibold text-gray-700">Publicate</h2>
          <PlacesTable items={published} />
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      ) : null}
    </div>
  );
}
