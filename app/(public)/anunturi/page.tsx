import type { Metadata } from "next";
import Link from "next/link";
import { searchListings } from "@/lib/search";
import { auth } from "@/lib/auth";
import CategoryFilter from "@/components/ui/CategoryFilter";
import ListingCard from "@/components/ui/ListingCard";

export const metadata: Metadata = {
  title: "Anunțuri",
  description: "Cumpără și vinde în Brașov — anunțuri de la oameni reali.",
};

const CATEGORIES = [
  "Electronice", "Mobilă", "Haine", "Auto", "Imobiliare", "Servicii", "Joburi", "Altele",
];

export default async function AnunturiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.categorie;
  const page = parseInt(params.pagina ?? "1");

  const [listings, session] = await Promise.all([
    searchListings(q, { page, category }).catch(() => []),
    auth(),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold font-serif text-[#1a4731]">Anunțuri</h1>
        {session ? (
          <Link
            href="/anunturi/nou"
            className="bg-[#d4820a] text-white font-semibold px-5 py-3 rounded-lg hover:bg-[#e8a020] transition-colors"
          >
            + Adaugă anunț
          </Link>
        ) : (
          <Link
            href="/intra"
            className="border border-[#d4820a] text-[#d4820a] font-semibold px-5 py-3 rounded-lg hover:bg-amber-50 transition-colors"
          >
            Intră în cont pentru a posta
          </Link>
        )}
      </div>

      <CategoryFilter categories={CATEGORIES} active={category} basePath="/anunturi" />

      {listings.length === 0 ? (
        <p className="text-gray-500 text-center py-20">Nu am găsit anunțuri.</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
