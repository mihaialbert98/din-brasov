import Link from "next/link";
import Image from "next/image";
import { Package, Zap, Phone, MapPin } from "lucide-react";
import { cardShell, cardImageFrame, cardImageZoom } from "@/lib/ui";
import Badge from "@/components/ui/Badge";

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
      <Link href={`/anunturi/${listing.slug}`} className={cardShell("p-4 flex flex-col gap-2")}>
        {listing.isAssisted && (
          <div>
            <Badge variant="neutral" icon={<Phone className="w-3 h-3" aria-hidden />}>
              Anunț Asistat
            </Badge>
          </div>
        )}
        <h3 className="font-serif font-semibold text-ink line-clamp-2 leading-snug">
          {listing.title}
        </h3>
        {listing.price && (
          <span className="text-xl font-bold text-accent tabular-nums">
            {listing.price} {listing.currency}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link href={`/anunturi/${listing.slug}`} className={cardShell("flex flex-col")}>
      {images[0] ? (
        <div className={cardImageFrame}>
          <Image
            src={images[0]}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className={cardImageZoom}
          />
        </div>
      ) : (
        <div className="w-full aspect-[3/2] bg-gradient-to-br from-cream/70 to-accent-soft flex items-center justify-center">
          <Package className="w-11 h-11 text-accent/40" aria-hidden />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {(listing.isBoosted || listing.isAssisted) && (
          <div className="flex gap-1.5 flex-wrap">
            {listing.isBoosted && (
              <Badge variant="accent" icon={<Zap className="w-3 h-3" aria-hidden />}>
                Promovat
              </Badge>
            )}
            {listing.isAssisted && (
              <Badge variant="neutral" icon={<Phone className="w-3 h-3" aria-hidden />}>
                Anunț Asistat
              </Badge>
            )}
          </div>
        )}
        <h2 className="font-serif font-semibold text-ink line-clamp-2 leading-snug">
          {listing.title}
        </h2>
        {listing.price ? (
          <p className="text-xl font-bold text-accent tabular-nums">
            {listing.price} {listing.currency}
          </p>
        ) : (
          <p className="text-base font-medium text-muted">Negociabil</p>
        )}
        {listing.location && (
          <p className="flex items-center gap-1 text-sm text-faint">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            <span className="truncate">{listing.location}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
