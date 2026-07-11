import { db } from "@/lib/db";
import { listings, listingReports, messages, users } from "@/lib/db/schema";
import { eq, desc, count, and, ne, inArray } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Pagination from "@/components/ui/Pagination";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Anunțuri" };

const STATUS_LABELS: Record<string, string> = {
  active: "Activ", suspended: "Suspendat", sold: "Vândut",
  expired: "Expirat", disabled: "Dezactivat", removed: "Șters",
};

const PAGE_SIZE = 30;

export default async function AdminAnunturiPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pagina?: string }>;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role as string;
  const params = await searchParams;
  const statusFilter = params.status ?? "all";
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  // Shared WHERE for the listings table + its count (keep them in sync).
  const listingsWhere =
    statusFilter === "all"
      ? ne(listings.status, "removed")
      : eq(listings.status, statusFilter);

  const [flaggedMessages, allListings, [{ total }], reportCounts] = await Promise.all([
    // Flagged messages (URL-containing scam attempts)
    db
      .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.status, "flagged"))
      .orderBy(desc(messages.createdAt))
      .limit(20),

    // Listings with seller name (paginated)
    db
      .select({
        id: listings.id,
        title: listings.title,
        slug: listings.slug,
        price: listings.price,
        currency: listings.currency,
        category: listings.category,
        status: listings.status,
        contactPhone: listings.contactPhone,
        isAssisted: listings.isAssisted,
        sellerId: listings.sellerId,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(listingsWhere)
      .orderBy(desc(listings.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    // Total for the current filter (drives pagination)
    db.select({ total: count() }).from(listings).where(listingsWhere),

    // Report counts per listing
    db
      .select({ listingId: listingReports.listingId, c: count() })
      .from(listingReports)
      .groupBy(listingReports.listingId),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const reportMap = Object.fromEntries(reportCounts.map((r) => [r.listingId, r.c]));

  // Get seller names
  const sellerIds = [...new Set(allListings.map((l) => l.sellerId).filter(Boolean))] as string[];
  const sellerNames: Record<string, string> = {};
  if (sellerIds.length > 0) {
    const sellers = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, sellerIds));
    sellers.forEach((s) => { sellerNames[s.id] = s.name ?? "—"; });
  }

  const tabs = [
    { key: "all", label: "Toate" },
    { key: "active", label: "Active" },
    { key: "disabled", label: "Dezactivate" },
    { key: "suspended", label: "Suspendate" },
    { key: "expired", label: "Expirate" },
    { key: "sold", label: "Vândute" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Anunțuri</h1>

      {/* Flagged messages */}
      {flaggedMessages.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-amber-800 mb-3 flex items-center gap-2">
            🚨 Mesaje cu link-uri reținute ({flaggedMessages.length})
          </h2>
          <p className="text-xs text-amber-700 mb-3">
            Aceste mesaje au fost blocate automat — nu au ajuns la vânzători.
          </p>
          <div className="space-y-2">
            {flaggedMessages.map((msg) => (
              <div key={msg.id} className="bg-white border border-amber-100 rounded-lg p-3">
                <p className="text-sm font-mono text-gray-800 break-all">{msg.body}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(msg.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Listings table */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 flex-wrap">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/admin/anunturi${tab.key === "all" ? "" : `?status=${tab.key}`}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === tab.key
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          <Link
            href="/admin/anunturi/nou-asistat"
            className="text-sm bg-[#c84b1e] text-white px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors font-medium"
          >
            + Anunț Asistat
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">Titlu</th>
                <th className="text-left p-3 font-semibold text-gray-600">Vânzător</th>
                <th className="text-left p-3 font-semibold text-gray-600">Telefon</th>
                <th className="text-left p-3 font-semibold text-gray-600">Preț</th>
                <th className="text-left p-3 font-semibold text-gray-600">Status</th>
                <th className="text-left p-3 font-semibold text-gray-600">Rap.</th>
                <th className="text-left p-3 font-semibold text-gray-600">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allListings.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <Link href={`/admin/anunturi/${l.id}`} className="font-medium text-gray-900 hover:underline">
                      {l.title}
                    </Link>
                    {l.isAssisted && (
                      <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">asistat</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500 text-xs">
                    {l.sellerId ? sellerNames[l.sellerId] ?? "—" : "—"}
                  </td>
                  <td className="p-3 text-gray-700 text-xs font-mono">
                    {l.contactPhone ?? "—"}
                  </td>
                  <td className="p-3 text-gray-700 text-xs">
                    {l.price ? `${l.price} ${l.currency}` : "—"}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={l.status} label={STATUS_LABELS[l.status] ?? l.status} />
                  </td>
                  <td className="p-3">
                    {(reportMap[l.id] ?? 0) > 0 ? (
                      <span className="text-red-600 font-bold text-xs">{reportMap[l.id]}</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="p3">
                    <div className="flex gap-1.5 items-center p-3">
                      {l.status === "suspended" ? (
                        <form action={`/api/admin/listings/${l.id}/restore`} method="POST">
                          <button type="submit" className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Restabilește
                          </button>
                        </form>
                      ) : l.status === "active" ? (
                        <form action={`/api/admin/listings/${l.id}/suspend`} method="POST">
                          <button type="submit" className="text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600">
                            Suspendă
                          </button>
                        </form>
                      ) : null}
                      {role === "admin" && l.status !== "removed" && (
                        <form action={`/api/admin/listings/${l.id}/remove`} method="POST">
                          <button type="submit" className="text-xs border border-red-300 text-red-600 px-2 py-1 rounded hover:bg-red-50">
                            Șterge
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {allListings.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-400">Nu există anunțuri.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          buildHref={(p) => {
            const parts: string[] = [];
            if (statusFilter !== "all") parts.push(`status=${statusFilter}`);
            if (p > 1) parts.push(`pagina=${p}`);
            return `/admin/anunturi${parts.length ? `?${parts.join("&")}` : ""}`;
          }}
        />
      </section>
    </div>
  );
}
