import Link from "next/link";
import Image from "next/image";

type Props = {
  listing: {
    id: string;
    slug: string;
    title: string;
    price: string | null;
    currency: string | null;
    location: string | null;
    imagesJson: string | null;
    isAssisted: boolean | null;
    isBoosted?: boolean | null;
  };
  compact?: boolean;
};

export default function ListingCard({ listing, compact = false }: Props) {
  const images: string[] = listing.imagesJson ? JSON.parse(listing.imagesJson) : [];

  if (compact) {
    return (
      <Link
        href={`/anunturi/${listing.slug}`}
        className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-2 border border-[#e8d9c5]"
      >
        {listing.isAssisted && (
          <span className="text-xs bg-[#e8d9c5] text-[#c84b1e] px-2 py-0.5 rounded-full self-start font-medium">
            📞 Anunț Asistat
          </span>
        )}
        <h3 className="font-semibold text-gray-900 line-clamp-2">{listing.title}</h3>
        {listing.price && (
          <span className="text-xl font-bold text-[#c84b1e]">
            {listing.price} {listing.currency}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={`/anunturi/${listing.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
    >
      {images[0] ? (
        <div className="relative w-full h-44">
          <Image
            src={images[0]}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="w-full h-44 bg-gray-100 flex items-center justify-center text-gray-400 text-4xl">
          📦
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex gap-1.5 flex-wrap">
          {listing.isBoosted && (
            <span className="text-xs bg-[#c84b1e] text-white px-2 py-0.5 rounded-full font-medium">
              ⚡ Promovat
            </span>
          )}
          {listing.isAssisted && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              Anunț Asistat
            </span>
          )}
        </div>
        <h2 className="font-semibold text-gray-900 line-clamp-2">{listing.title}</h2>
        {listing.price ? (
          <p className="text-xl font-bold text-[#1a4731]">
            {listing.price} {listing.currency}
          </p>
        ) : (
          <p className="text-base font-medium text-gray-500">Negociabil</p>
        )}
        {listing.location && <p className="text-sm text-gray-400">{listing.location}</p>}
      </div>
    </Link>
  );
}
