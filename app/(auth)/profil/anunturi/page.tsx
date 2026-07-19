import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/ui/Pagination";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anunțurile mele" };

const PER_PAGE = 15;

const STATUS_LABEL: Record<string, string> = {
  active: "Activ", sold: "Vândut", expired: "Expirat", disabled: "Dezactivat", suspended: "Suspendat", removed: "Eliminat",
};
function statusClass(s: string) {
  switch (s) {
    case "active": return "bg-green-100 text-green-800";
    case "sold": return "bg-blue-100 text-blue-800";
    case "expired": return "bg-amber-100 text-amber-800";
    case "disabled": return "bg-gray-200 text-gray-700";
    default: return "bg-red-100 text-red-800";
  }
}

export default async function ProfilAnunturiPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");
  const userId = session.user.id;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.pagina ?? "1"));

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(listings).where(eq(listings.sellerId, userId)),
    db
      .select({
        id: listings.id, title: listings.title, slug: listings.slug,
        price: listings.price, currency: listings.currency, status: listings.status,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(eq(listings.sellerId, userId))
      .orderBy(desc(listings.createdAt))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="w-full max-w-2xl">
      <Link href="/profil" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Înapoi la profil
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Anunțurile mele ({total})</h1>

      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">Nu ai niciun anunț.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {rows.map((l) => (
            <div key={l.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/anunturi/${l.slug}`} className="font-medium text-gray-900 hover:underline line-clamp-1">
                  {l.title}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass(l.status)}`}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                  {l.price && <span className="text-sm text-gray-500 tabular-nums">{l.price} {l.currency}</span>}
                  <span className="text-xs text-gray-400">{formatDate(l.createdAt)}</span>
                </div>
              </div>
              {l.status === "active" && (
                <Link href={`/anunturi/${l.slug}/editeaza`} className="text-sm px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors flex-shrink-0">
                  Editează
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        buildHref={(p) => `/profil/anunturi${p > 1 ? `?pagina=${p}` : ""}`}
      />
    </div>
  );
}
