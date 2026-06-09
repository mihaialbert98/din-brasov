import Link from "next/link";

type Props = {
  place: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    category: string | null;
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

export default function PlaceCard({ place, compact = false }: Props) {
  const image = firstImage(place.imagesJson);

  if (compact) {
    return (
      <Link
        href={`/localuri/${place.slug}`}
        className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden border border-[#e8d9c5] flex flex-col"
      >
        {image ? (
          <img src={image} alt={place.name} className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-[#e8d9c5] to-[#c84b1e]/20 flex items-center justify-center">
            <span className="text-3xl">🏠</span>
          </div>
        )}
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs bg-[#e8d9c5] text-[#c84b1e] px-2 py-0.5 rounded-full self-start font-medium">
            {place.category ?? "Local"}
          </span>
          <h3 className="font-semibold text-gray-900">{place.name}</h3>
          {place.address && <span className="text-sm text-gray-500">📍 {place.address}</span>}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/localuri/${place.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col group"
    >
      {image ? (
        <img src={image} alt={place.name} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-[#e8d9c5] to-[#c84b1e]/20 flex items-center justify-center">
          <span className="text-4xl">🏠</span>
        </div>
      )}
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
