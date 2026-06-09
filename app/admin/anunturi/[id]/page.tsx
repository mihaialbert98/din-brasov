import { notFound } from "next/navigation";
import { eq, desc, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, listingReports, conversations, users } from "@/lib/db/schema";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Detalii anunț" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminListingDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string;

  const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!listing) notFound();

  const [reports, convCount, seller] = await Promise.all([
    db
      .select({ id: listingReports.id, reason: listingReports.reason, createdAt: listingReports.createdAt, ipHash: listingReports.ipHash })
      .from(listingReports)
      .where(eq(listingReports.listingId, id))
      .orderBy(desc(listingReports.createdAt)),
    db.select({ c: count() }).from(conversations).where(eq(conversations.listingId, id)),
    listing.sellerId
      ? db.select({ name: users.name, email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, listing.sellerId)).limit(1)
      : Promise.resolve([]),
  ]);

  const images: string[] = listing.imagesJson ? JSON.parse(listing.imagesJson) : [];
  const sellerInfo = (seller as any[])[0];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/anunturi" className="text-gray-400 hover:text-gray-700 transition-colors">← Înapoi</Link>
        <h1 className="text-2xl font-bold text-gray-900 flex-1 min-w-0 truncate">{listing.title}</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Listing details */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 border-b pb-2">Detalii anunț</h2>
          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <img key={i} src={src} alt="" className="w-24 h-24 object-cover rounded-lg flex-shrink-0" />
              ))}
            </div>
          )}
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd className="font-medium capitalize">{listing.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Categorie</dt>
              <dd>{listing.category}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Preț</dt>
              <dd className="font-semibold">{listing.price ? `${listing.price} ${listing.currency}` : "Negociabil"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Stare produs</dt>
              <dd>{listing.condition === "new" ? "Nou" : listing.condition === "used" ? "Folosit" : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Locație</dt>
              <dd>{listing.location ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Publicat</dt>
              <dd>{formatDate(listing.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Expiră</dt>
              <dd>{listing.expiresAt ? formatDate(listing.expiresAt) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Telefon contact</dt>
              <dd className="font-mono font-semibold">{listing.contactPhone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Email contact</dt>
              <dd className="text-xs">{listing.contactEmail ?? "—"}</dd>
            </div>
            {listing.isAssisted && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Tip</dt>
                <dd><span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">Anunț Asistat</span></dd>
              </div>
            )}
          </dl>
          <p className="text-sm text-gray-700 pt-2 border-t whitespace-pre-wrap">{listing.description}</p>
        </div>

        {/* Seller + stats */}
        <div className="space-y-4">
          {sellerInfo && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-800 border-b pb-2 mb-3">Vânzător</h2>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Nume</dt>
                  <dd className="font-medium">{sellerInfo.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Email</dt>
                  <dd className="text-xs">{sellerInfo.email}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cont creat</dt>
                  <dd>{sellerInfo.createdAt ? formatDate(sellerInfo.createdAt) : "—"}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 border-b pb-2 mb-3">Statistici</h2>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-gray-500">Rapoarte</dt>
                <dd className={`font-bold ${reports.length > 0 ? "text-red-600" : "text-gray-400"}`}>{reports.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Conversații</dt>
                <dd>{convCount[0]?.c ?? 0}</dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 border-b pb-2 mb-3">Acțiuni</h2>
            <div className="flex flex-col gap-2">
              {listing.status === "active" && (
                <form action={`/api/admin/listings/${id}/suspend`} method="POST">
                  <button type="submit" className="w-full bg-amber-500 text-white font-medium py-2 rounded-lg hover:bg-amber-600 transition-colors text-sm">
                    Suspendă anunțul
                  </button>
                </form>
              )}
              {listing.status === "suspended" && (
                <form action={`/api/admin/listings/${id}/restore`} method="POST">
                  <button type="submit" className="w-full bg-green-600 text-white font-medium py-2 rounded-lg hover:bg-green-700 transition-colors text-sm">
                    Restabilește anunțul
                  </button>
                </form>
              )}
              {role === "admin" && listing.status !== "removed" && (
                <form action={`/api/admin/listings/${id}/remove`} method="POST">
                  <button type="submit" className="w-full border border-red-300 text-red-600 font-medium py-2 rounded-lg hover:bg-red-50 transition-colors text-sm">
                    Șterge definitiv (admin)
                  </button>
                </form>
              )}
              <Link href={`/anunturi/${listing.slug}`} target="_blank" className="block text-center text-sm text-gray-500 hover:underline py-1">
                Vezi anunțul public →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Reports */}
      {reports.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Rapoarte ({reports.length})</h2>
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                <p className="text-sm text-gray-700">{r.reason ?? "Fără motiv specificat"}</p>
                <p className="text-xs text-gray-400 whitespace-nowrap">{r.createdAt ? formatDate(r.createdAt, { day: "numeric", month: "short" }) : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
