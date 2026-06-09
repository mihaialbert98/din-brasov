import Link from "next/link";

type Props = {
  place: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    category: string | null;
  };
  compact?: boolean;
};

export default function PlaceCard({ place, compact = false }: Props) {
  if (compact) {
    return (
      <Link
        href={`/localuri/${place.slug}`}
        className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-2 border border-[#e8d9c5]"
      >
        <span className="text-xs bg-[#e8d9c5] text-[#c84b1e] px-2 py-0.5 rounded-full self-start font-medium">
          {place.category ?? "Local"}
        </span>
        <h3 className="font-semibold text-gray-900">{place.name}</h3>
        {place.address && <span className="text-sm text-gray-500">📍 {place.address}</span>}
      </Link>
    );
  }

  return (
    <Link
      href={`/localuri/${place.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
    >
      <div className="p-5 flex flex-col gap-2 flex-1">
        {place.category && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full self-start font-medium">
            {place.category}
          </span>
        )}
        <h2 className="font-semibold text-gray-900">{place.name}</h2>
        {place.address && <p className="text-sm text-gray-500">📍 {place.address}</p>}
      </div>
    </Link>
  );
}
