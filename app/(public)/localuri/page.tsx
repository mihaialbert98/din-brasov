import type { Metadata } from "next";
import { searchPlaces } from "@/lib/search";
import PlaceCard from "@/components/ui/PlaceCard";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Localuri",
  description: "Localuri noi și recomandate din Brașov.",
};

export default async function LocaluriPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string }>;
}) {
  const params = await searchParams;

  const [items, allPlaces] = await Promise.all([
    searchPlaces(params.q ?? "", { category: params.categorie }).catch(() => []),
    db.select({ category: places.category }).from(places).where(eq(places.status, "published")),
  ]);

  const categories = [...new Set(allPlaces.map((p) => p.category).filter(Boolean))] as string[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-2">Localuri din Brașov</h1>
      <p className="text-gray-500 mb-6">Restaurante, cafenele, magazine și alte localuri recomandate</p>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <Link
            href="/localuri"
            className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
              !params.categorie ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Toate
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/localuri?categorie=${encodeURIComponent(cat)}`}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                params.categorie === cat ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-gray-500 text-center py-20">
          {params.categorie ? `Nu există localuri în categoria „${params.categorie}".` : "Nu există localuri adăugate."}
        </p>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
