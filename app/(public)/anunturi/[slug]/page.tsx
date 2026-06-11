import { notFound } from "next/navigation";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, listingFavourites } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { RevealPhoneButton } from "@/components/marketplace/RevealPhoneButton";
import { ContactSellerButton } from "@/components/marketplace/ContactSellerButton";
import { ReportButton } from "@/components/marketplace/ReportButton";
import FavouriteButton from "@/components/anunturi/FavouriteButton";
import { ReportUserButton } from "@/components/anunturi/ReportUserButton";
import { BoostButton } from "@/components/marketplace/BoostButton";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ payment?: string }> };

async function getListing(slug: string) {
  const [item] = await db
    .select()
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  return item;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getListing(slug);
  if (!item) return {};
  return {
    title: item.title,
    description: item.description.slice(0, 155),
  };
}

export default async function AnuntPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const paymentStatus = sp?.payment;
  const [listing, session] = await Promise.all([getListing(slug), auth()]);

  if (!listing || listing.status === "removed") notFound();

  const images: string[] = listing.imagesJson ? JSON.parse(listing.imagesJson) : [];
  const isSuspended = listing.status === "suspended";
  const isOwner = !!session?.user?.id && session.user.id === listing.sellerId;

  const favouriteCount = isOwner
    ? await db
        .select({ value: count() })
        .from(listingFavourites)
        .where(and(eq(listingFavourites.listingId, listing.id)))
        .then((r) => r[0]?.value ?? 0)
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {paymentStatus === "success" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-green-800 text-sm">
          ✅ Plată finalizată cu succes! Anunțul tău este acum activ.
        </div>
      )}
      {paymentStatus === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800 text-sm">
          ⏳ Plata este în curs de procesare. Anunțul va apărea în câteva momente.
        </div>
      )}
      {isSuspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          ⚠️ Acest anunț a fost suspendat temporar pentru verificare.
        </div>
      )}

      {/* Image gallery */}
      {images.length > 0 && (
        <div className="mb-6 overflow-x-auto flex gap-3">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`${listing.title} - fotografie ${i + 1}`}
              className={`rounded-xl object-cover ${
                i === 0 ? "w-full max-h-96 flex-shrink-0" : "h-24 w-24 flex-shrink-0"
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-3 flex-wrap mb-4">
        {listing.isAssisted && (
          <span className="bg-amber-100 text-amber-800 text-sm px-3 py-1 rounded-full font-medium">
            📞 Anunț Asistat — publicat de echipa Din Brașov
          </span>
        )}
        {listing.status === "sold" && (
          <span className="bg-red-100 text-red-800 text-sm px-3 py-1 rounded-full font-medium">
            Vândut
          </span>
        )}
        <span className="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {listing.category}
        </span>
        {listing.condition && listing.condition !== "not_applicable" && (
          <span className="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            {listing.condition === "new" ? "Nou" : "Folosit"}
          </span>
        )}
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">{listing.title}</h1>

      {listing.price ? (
        <p className="text-3xl font-bold text-[#c84b1e] mb-6">
          {listing.price} {listing.currency}
        </p>
      ) : (
        <p className="text-xl font-medium text-gray-500 mb-6">Preț negociabil</p>
      )}

      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-3">Descriere</h2>
        <p className="text-gray-700 whitespace-pre-wrap">{listing.description}</p>
      </div>

      {/* Contact section — phone never in HTML source */}
      {!isSuspended && listing.status === "active" && (
        <div className="bg-[#1a1a1a] text-white rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Contact vânzător</h2>
          <div className="flex flex-col gap-3">
            {listing.contactPhone && (
              <RevealPhoneButton listingId={listing.id} />
            )}
            {listing.sellerId && (
              <ContactSellerButton
                listingId={listing.id}
                listingTitle={listing.title}
              />
            )}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            🔒 Numărul de telefon este protejat. Autentifică-te pentru a-l vedea.
          </p>
        </div>
      )}

      <div className="text-sm text-gray-400 space-y-1 mb-6">
        {listing.location && <p>📍 {listing.location}</p>}
        <p>Publicat: {formatDate(listing.createdAt)}</p>
        {listing.expiresAt && listing.status === "active" && (
          <p>Expiră: {formatDate(listing.expiresAt)}</p>
        )}
      </div>

      {/* Owner boost widget */}
      {isOwner && listing.status === "active" && (
        <div className="mb-6">
          <BoostButton
            listingId={listing.id}
            isBoosted={listing.isBoosted ?? false}
            boostedUntil={listing.boostedUntil}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {listing.status === "active" && (
          <FavouriteButton
            listingId={listing.id}
            favouriteCount={favouriteCount}
            isOwner={isOwner}
          />
        )}
        <div className="ml-auto flex flex-col items-end gap-2">
          <ReportButton listingId={listing.id} />
          {listing.sellerId && !isOwner && (
            <ReportUserButton
              reportedUserId={listing.sellerId}
              listingId={listing.id}
            />
          )}
        </div>
      </div>
    </div>
  );
}
