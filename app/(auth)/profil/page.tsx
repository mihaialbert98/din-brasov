import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listings, listingFavourites, users } from "@/lib/db/schema";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { RETENTION } from "@/lib/gdpr";
import RenewButton from "@/components/profil/RenewButton";
import DeleteOwnListingButton from "@/components/profil/DeleteOwnListingButton";
import UnfavouriteButton from "@/components/profil/UnfavouriteButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profilul meu" };

const STATUS_LABELS: Record<string, string> = {
  active: "Activ",
  sold: "Vândut",
  expired: "Expirat",
  suspended: "Suspendat",
  removed: "Eliminat",
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "active": return "bg-green-100 text-green-800";
    case "sold": return "bg-blue-100 text-blue-800";
    case "expired": return "bg-amber-100 text-amber-800";
    case "suspended":
    case "removed": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

function isWithinGracePeriod(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const graceCutoff = new Date(Date.now() - RETENTION.LISTING_POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return expiresAt > graceCutoff;
}

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/intra");

  const userId = session.user.id!;

  const [me] = await db
    .select({ isFoundingMember: users.isFoundingMember })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const myListings = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      price: listings.price,
      currency: listings.currency,
      status: listings.status,
      expiresAt: listings.expiresAt,
      createdAt: listings.createdAt,
    })
    .from(listings)
    .where(eq(listings.sellerId, userId))
    .orderBy(desc(listings.createdAt));

  // Favourite counts for each of my listings
  const myListingIds = myListings.map((l) => l.id);
  const favCounts =
    myListingIds.length > 0
      ? await db
          .select({ listingId: listingFavourites.listingId, value: count() })
          .from(listingFavourites)
          .where(inArray(listingFavourites.listingId, myListingIds))
          .groupBy(listingFavourites.listingId)
      : [];

  const favCountMap = Object.fromEntries(favCounts.map((r) => [r.listingId, r.value]));

  // Saved listings (only active ones)
  const savedRows = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      price: listings.price,
      currency: listings.currency,
      category: listings.category,
      status: listings.status,
    })
    .from(listingFavourites)
    .innerJoin(listings, eq(listingFavourites.listingId, listings.id))
    .where(and(eq(listingFavourites.userId, userId), eq(listings.status, "active")));

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-8">Profilul meu</h1>

      {/* User info */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-lg">{session.user.name}</p>
          {me?.isFoundingMember && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-[#d4820a] to-[#c84b1e] text-white">
              ★ Membru fondator
            </span>
          )}
        </div>
        <p className="text-gray-500">{session.user.email}</p>
        {me?.isFoundingMember && (
          <p className="text-sm text-gray-500 mt-2">
            Beneficii: 4 anunțuri gratuite pe viață · acces timpuriu la funcții noi · suport prioritar.
          </p>
        )}
      </div>

      {/* My listings */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Anunțurile mele</h2>
          <Link
            href="/anunturi/nou"
            className="text-sm text-[#c84b1e] font-medium hover:underline"
          >
            + Adaugă anunț
          </Link>
        </div>
        {myListings.length === 0 ? (
          <p className="text-gray-500 text-sm">Nu ai niciun anunț publicat.</p>
        ) : (
          <ul className="divide-y">
            {myListings.map((l) => {
              const favCount = favCountMap[l.id] ?? 0;
              const canRenew = l.status === "expired" && isWithinGracePeriod(l.expiresAt);
              const canEdit = l.status === "active";
              return (
                <li key={l.id} className="py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/anunturi/${l.slug}`}
                      className="font-medium text-gray-900 hover:underline line-clamp-1"
                    >
                      {l.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(l.status)}`}>
                        {STATUS_LABELS[l.status] ?? l.status}
                      </span>
                      {favCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          ❤️ {favCount} {favCount === 1 ? "salvare" : "salvări"}
                        </span>
                      )}
                      {l.expiresAt && l.status === "active" && (
                        <span className="text-xs text-gray-400">
                          expiră {formatDate(l.expiresAt)}
                        </span>
                      )}
                      {l.expiresAt && l.status === "expired" && (
                        <span className="text-xs text-gray-400">
                          expirat {formatDate(l.expiresAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 items-center flex-wrap">
                    {canEdit && (
                      <Link
                        href={`/anunturi/${l.slug}/editeaza`}
                        className="text-sm px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                      >
                        Editează
                      </Link>
                    )}
                    {canEdit && <DeleteOwnListingButton listingId={l.id} title={l.title} />}
                    {canRenew && (
                      <>
                        <RenewButton listingId={l.id} />
                        <DeleteOwnListingButton listingId={l.id} title={l.title} />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Saved listings */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Anunțuri salvate</h2>
        {savedRows.length === 0 ? (
          <p className="text-gray-500 text-sm">Nu ai salvat niciun anunț.</p>
        ) : (
          <ul className="divide-y">
            {savedRows.map((l) => (
              <li key={l.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/anunturi/${l.slug}`}
                    className="font-medium text-gray-900 hover:underline line-clamp-1"
                  >
                    {l.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    {l.category && (
                      <span className="text-xs text-gray-500">{l.category}</span>
                    )}
                    {l.price && (
                      <span className="text-xs font-medium text-[#c84b1e]">
                        {l.price} {l.currency}
                      </span>
                    )}
                  </div>
                </div>
                <UnfavouriteButton listingId={l.id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Account actions */}
      <div className="flex flex-col gap-3">
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Deconectare
          </button>
        </form>

        <Link
          href="/profil/stergere"
          className="text-center text-sm text-red-500 hover:underline py-2"
        >
          Șterge contul meu
        </Link>
      </div>
    </div>
  );
}
