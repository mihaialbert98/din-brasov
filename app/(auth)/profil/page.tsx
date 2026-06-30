import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listings, listingFavourites, users, paidSlots, newsletterSubscribers } from "@/lib/db/schema";
import { eq, and, or, desc, count, inArray } from "drizzle-orm";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { RETENTION } from "@/lib/gdpr";
import { isStaffExempt, countReusablePaidSlots, SLOT_STATUSES } from "@/lib/permissions";
import RenewButton from "@/components/profil/RenewButton";
import ListingRules from "@/components/marketplace/ListingRules";
import DeleteOwnListingButton from "@/components/profil/DeleteOwnListingButton";
import UnfavouriteButton from "@/components/profil/UnfavouriteButton";
import NewsletterPreferences from "@/components/profil/NewsletterPreferences";
import { getUserRestaurants } from "@/lib/restaurant-permissions";
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

/** Days until an expired listing is auto-deleted (0 = today). */
function graceDaysLeft(expiresAt: Date | null): number {
  if (!expiresAt) return 0;
  const deleteAt = new Date(expiresAt).getTime() + RETENTION.LISTING_POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((deleteAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/intra");

  const userId = session.user.id!;

  const [me] = await db
    .select({
      isFoundingMember: users.isFoundingMember,
      freeListingsAllowance: users.freeListingsAllowance,
      role: users.role,
    })
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
      isPaid: listings.isPaid,
      // Whether this paid listing's slot has already used its one free replacement.
      // If yes, deleting it loses the paid slot for good (drives the delete warning).
      slotReplacementUsed: paidSlots.replacementUsed,
    })
    .from(listings)
    .leftJoin(paidSlots, eq(listings.paidSlotId, paidSlots.id))
    .where(eq(listings.sellerId, userId))
    .orderBy(desc(listings.createdAt));

  // Slot usage — free (non-paid) active + expired-in-grace listings occupy a free
  // slot (matches the create API). Paid listings don't count against the free quota.
  const allowance = me?.freeListingsAllowance ?? 2;
  const slotsUsed = myListings.filter(
    (l) => !l.isPaid && (SLOT_STATUSES as readonly string[]).includes(l.status)
  ).length;
  // Vacated paid slots the user can still fill with one free replacement.
  const reusablePaidSlots = await countReusablePaidSlots(userId);

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

  // Newsletter subscription — matched by account id or email (account subscribers
  // are linked by both). Only an "active" subscription counts as opted-in.
  const userEmail = session.user.email ?? null;
  const [subscriber] = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      userEmail
        ? or(eq(newsletterSubscribers.userId, userId), eq(newsletterSubscribers.email, userEmail))
        : eq(newsletterSubscribers.userId, userId)
    )
    .limit(1);
  const newsletterPrefs =
    subscriber && subscriber.status === "active"
      ? {
          wantsNews: subscriber.wantsNews,
          wantsEvents: subscriber.wantsEvents,
          wantsPlaces: subscriber.wantsPlaces,
          wantsExperiences: subscriber.wantsExperiences,
        }
      : { wantsNews: false, wantsEvents: false, wantsPlaces: false, wantsExperiences: false };

  // Restaurants this user belongs to (owner or waiter) — entry point to the panel.
  const myRestaurants = await getUserRestaurants(userId);

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
            Beneficii: 4 anunțuri active gratuite · acces timpuriu la funcții noi · suport prioritar.
          </p>
        )}
      </div>

      {/* My listings */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-lg">Anunțurile mele</h2>
          <Link
            href="/anunturi/nou"
            className="text-sm text-[#c84b1e] font-medium hover:underline"
          >
            + Adaugă anunț
          </Link>
        </div>
        {!isStaffExempt(me?.role) && (
          <p className="text-sm text-gray-500 mb-1">
            Folosești <strong>{slotsUsed}</strong> din {allowance} anunțuri active gratuite.
          </p>
        )}
        {reusablePaidSlots > 0 && (
          <p className="text-sm text-[#c84b1e] font-medium mb-4">
            Ai <strong>{reusablePaidSlots}</strong> {reusablePaidSlots === 1 ? "slot plătit disponibil" : "sloturi plătite disponibile"}
            {" "}— poți publica o înlocuire gratuită pentru zilele rămase.
          </p>
        )}

        <ListingRules allowance={allowance} />

        {myListings.length === 0 ? (
          <p className="text-gray-500 text-sm">Nu ai niciun anunț publicat.</p>
        ) : (
          <ul className="divide-y">
            {myListings.map((l) => {
              const favCount = favCountMap[l.id] ?? 0;
              const canRenew = l.status === "expired" && isWithinGracePeriod(l.expiresAt);
              const canEdit = l.status === "active";
              // Deleting a paid listing whose slot's free replacement is already used
              // closes the paid slot — warn. If the replacement is still available,
              // reassure instead.
              const deleteWarning = l.isPaid
                ? l.slotReplacementUsed
                  ? "Acesta e un anunț plătit, iar înlocuirea gratuită a fost deja folosită. Dacă îl ștergi, slotul plătit se închide și va trebui să plătești din nou."
                  : "Acesta e un anunț plătit. Dacă îl ștergi, poți publica o singură înlocuire gratuită în slotul rămas."
                : undefined;
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.isPaid ? "bg-[#c84b1e]/10 text-[#c84b1e]" : "bg-gray-100 text-gray-600"}`}>
                        {l.isPaid ? "Plătit" : "Gratuit"}
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
                      {l.status === "expired" && canRenew && (
                        <span className="text-xs font-medium text-red-600">
                          {(() => {
                            const d = graceDaysLeft(l.expiresAt);
                            return d <= 0
                              ? "se șterge azi dacă nu reînnoiești"
                              : `se șterge în ${d} ${d === 1 ? "zi" : "zile"} dacă nu reînnoiești`;
                          })()}
                        </span>
                      )}
                      {l.status === "expired" && !canRenew && l.expiresAt && (
                        <span className="text-xs text-gray-400">expirat {formatDate(l.expiresAt)}</span>
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
                    {canEdit && <DeleteOwnListingButton listingId={l.id} title={l.title} warning={deleteWarning} />}
                    {canRenew && (
                      <>
                        <RenewButton listingId={l.id} />
                        <DeleteOwnListingButton listingId={l.id} title={l.title} warning={deleteWarning} />
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

      {/* Restaurants I manage / work at */}
      {myRestaurants.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Restaurantele mele</h2>
          <ul className="divide-y">
            {myRestaurants.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/restaurant/${r.slug}`}
                    className="font-medium text-gray-900 hover:underline line-clamp-1"
                  >
                    {r.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      Proprietar
                    </span>
                    {r.status === "suspended" && (
                      <span className="text-xs text-red-600">Suspendat</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/restaurant/${r.slug}`}
                  className="text-sm text-[#c84b1e] font-medium hover:underline flex-shrink-0"
                >
                  Deschide →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Newsletter preferences */}
      <NewsletterPreferences initial={newsletterPrefs} />

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
