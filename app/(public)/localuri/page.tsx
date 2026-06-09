import type { Metadata } from "next";
import { searchPlaces } from "@/lib/search";
import PlaceCard from "@/components/ui/PlaceCard";

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
  const items = await searchPlaces(params.q ?? "", {
    category: params.categorie,
  }).catch(() => []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-8">Localuri din Brașov</h1>
      {items.length === 0 ? (
        <p className="text-gray-500 text-center py-20">Nu există localuri adăugate.</p>
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
