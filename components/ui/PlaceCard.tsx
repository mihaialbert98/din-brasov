import Link from "next/link";
import Image from "next/image";
import { MapPin, Store } from "lucide-react";
import { cardShell, cardImageFrame, cardImageZoom } from "@/lib/ui";
import Badge from "@/components/ui/Badge";

type Props = {
  place: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    category: string | null;
    cuisineType?: string | null;
    imagesJson?: string | null;
  };
  compact?: boolean;
};

function firstImage(imagesJson?: string | null): string | null {
  if (!imagesJson) return null;
  try {
    const arr = JSON.parse(imagesJson);
    return Array.isArray(arr) && arr[0] ? arr[0] : null;
  } catch {
    return null;
  }
}

function ImageFallback() {
  return (
    <div className="w-full aspect-[3/2] bg-gradient-to-br from-cream/70 to-accent-soft flex items-center justify-center">
      <Store className="w-11 h-11 text-accent/40" aria-hidden />
    </div>
  );
}

export default function PlaceCard({ place, compact = false }: Props) {
  const image = firstImage(place.imagesJson);

  return (
    <Link href={`/localuri/${place.slug}`} className={cardShell("flex flex-col")}>
      {image ? (
        <div className={cardImageFrame}>
          <Image
            src={image}
            alt={place.name}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className={cardImageZoom}
          />
        </div>
      ) : (
        <ImageFallback />
      )}
      <div className={`flex flex-col gap-2 flex-1 ${compact ? "p-4" : "p-5"}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="category" category={place.category}>
            {place.category ?? "Local"}
          </Badge>
          {place.cuisineType && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cream/60 text-ink/70 border border-hairline">
              {place.cuisineType}
            </span>
          )}
        </div>
        <h2 className="font-serif font-semibold text-ink line-clamp-2 leading-snug">{place.name}</h2>
        {place.address && (
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-faint" aria-hidden />
            <span className="truncate">{place.address}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
