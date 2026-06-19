import Link from "next/link";

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
  const dim = size === "sm" ? "w-14 h-14 rounded-xl text-xl" : "w-16 h-16 rounded-lg text-xl";
  return (
    <div className={`flex-shrink-0 ${dim} bg-[#1a4731] text-white flex flex-col items-center justify-center`}>
      <span className="font-bold leading-none">{day}</span>
      <span className="text-xs uppercase leading-none mt-0.5">{month}</span>
    </div>
  );
}

function priceLabel(event: Props["event"]) {
  return event.isFree ? "Intrare liberă" : event.price ? `${event.price} ${event.currency}` : "";
}

export default function EventCard({ event, compact = false }: Props) {
  if (compact) {
    return (
      <Link
        href={`/evenimente/${event.slug}`}
        className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 flex gap-4 border border-[#e8d9c5]"
      >
        <DateBadge startsAt={event.startsAt} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 line-clamp-2">{event.title}</h3>
          {event.locationName && (
            <p className="text-sm text-gray-500 mt-1">📍 {event.locationName}</p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/evenimente/${event.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
    >
      {/* Cover image with the date badge overlaid (top-left). When there's no
          image, fall back to a brand-coloured banner so cards stay uniform. */}
      <div className="relative">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className="w-full h-44 object-cover" />
        ) : (
          <div className="w-full h-44 bg-[#1a4731]/10 flex items-center justify-center">
            <span className="text-5xl opacity-40" aria-hidden>📅</span>
          </div>
        )}
        <div className="absolute top-3 left-3 shadow-md rounded-lg overflow-hidden">
          <DateBadge startsAt={event.startsAt} />
        </div>
        {event.category && (
          <span className="absolute top-3 right-3 bg-white/90 text-[#1a4731] text-xs font-semibold px-2.5 py-1 rounded-full">
            {event.category}
          </span>
        )}
      </div>

      <div className="p-5 flex-1">
        <h2 className="font-semibold text-gray-900 line-clamp-2">{event.title}</h2>
        {event.locationName && (
          <p className="text-sm text-gray-500 mt-1">📍 {event.locationName}</p>
        )}
        {priceLabel(event) && (
          <p className="text-sm text-[#d4820a] mt-1 font-medium">{priceLabel(event)}</p>
        )}
      </div>
    </Link>
  );
}
