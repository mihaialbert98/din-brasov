import Link from "next/link";
import Image from "next/image";
import { MapPin, CalendarDays } from "lucide-react";
import { isOptimizableImage } from "@/lib/utils";
import { cardShell, cardImageFrame, cardImageZoom } from "@/lib/ui";
import Badge from "@/components/ui/Badge";

type Props = {
  event: {
    id: string;
    slug: string;
    title: string;
    locationName: string | null;
    startsAt: Date | null;
    isFree: boolean | null;
    price: string | null;
    currency: string | null;
    imageUrl?: string | null;
    category?: string | null;
  };
  compact?: boolean;
};

function DateBadge({ startsAt, size = "md" }: { startsAt: Date | null; size?: "sm" | "md" }) {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat("ro-RO", { day: "numeric" }).format(d);
  const month = new Intl.DateTimeFormat("ro-RO", { month: "short" }).format(d);
  const dim = size === "sm" ? "w-14 h-14 rounded-xl" : "w-16 h-16 rounded-xl";
  return (
    <div
      className={`flex-shrink-0 ${dim} bg-ink text-white flex flex-col items-center justify-center leading-none`}
    >
      <span className="text-xl font-bold tabular-nums">{day}</span>
      <span className="text-[11px] uppercase tracking-wide mt-1 text-white/80">{month}</span>
    </div>
  );
}

function priceLabel(event: Props["event"]) {
  return event.isFree ? "Intrare liberă" : event.price ? `${event.price} ${event.currency}` : "";
}

export default function EventCard({ event, compact = false }: Props) {
  if (compact) {
    return (
      <Link href={`/evenimente/${event.slug}`} className={cardShell("p-4 flex gap-4 items-center")}>
        <DateBadge startsAt={event.startsAt} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-semibold text-ink line-clamp-2 leading-snug">
            {event.title}
          </h3>
          {event.locationName && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-faint" aria-hidden />
              <span className="truncate">{event.locationName}</span>
            </p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/evenimente/${event.slug}`} className={cardShell("flex flex-col")}>
      {/* Cover with the date badge overlaid; a calm fallback keeps cards uniform. */}
      <div className="relative">
        {event.imageUrl ? (
          <div className={cardImageFrame}>
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className={cardImageZoom}
              unoptimized={!isOptimizableImage(event.imageUrl)}
            />
          </div>
        ) : (
          <div className="w-full aspect-[3/2] bg-gradient-to-br from-cream/70 to-accent-soft flex items-center justify-center">
            <CalendarDays className="w-12 h-12 text-accent/40" aria-hidden />
          </div>
        )}
        <div className="absolute top-3 left-3 shadow-md rounded-xl overflow-hidden">
          <DateBadge startsAt={event.startsAt} />
        </div>
        {event.category && (
          <div className="absolute top-3 right-3">
            <Badge variant="onImage">{event.category}</Badge>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col gap-1.5">
        <h2 className="font-serif font-semibold text-lg text-ink line-clamp-2 leading-snug">
          {event.title}
        </h2>
        {event.locationName && (
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-faint" aria-hidden />
            <span className="truncate">{event.locationName}</span>
          </p>
        )}
        {priceLabel(event) && (
          <p className="mt-1 text-sm font-semibold text-accent tabular-nums">{priceLabel(event)}</p>
        )}
      </div>
    </Link>
  );
}
