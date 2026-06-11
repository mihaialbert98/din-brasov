import type { Metadata } from "next";
import Link from "next/link";
import { searchListings, type ListingSort } from "@/lib/search";
import { auth } from "@/lib/auth";
import CategoryFilter from "@/components/ui/CategoryFilter";
import ListingCard from "@/components/ui/ListingCard";
import Pagination from "@/components/ui/Pagination";

export const metadata: Metadata = {
  title: "Anunțuri",
  description: "Cumpără și vinde în Brașov — anunțuri de la oameni reali.",
};

const CATEGORIES = [
  "Electronice", "Mobilă", "Haine", "Auto", "Imobiliare", "Sport", "Servicii", "Joburi", "Altele",
];

const SORT_OPTIONS: { value: ListingSort; label: string }[] = [
  { value: "newest", label: "Cele mai noi" },
  { value: "oldest", label: "Cele mai vechi" },
  { value: "price_asc", label: "Preț crescător" },
  { value: "price_desc", label: "Preț descrescător" },
];

export default async function AnunturiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; pagina?: string; sortare?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.categorie;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));
  const sort = (SORT_OPTIONS.find((o) => o.value === params.sortare)?.value ?? "newest") as ListingSort;

  const [result, session] = await Promise.all([
    searchListings(q, { page, category, sort }).catch(() => ({ listings: [], total: 0, pageSize: 20 })),
    auth(),
  ]);

  const { listings, total, pageSize } = result;
  const totalPages = Math.ceil(total / pageSize);

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("categorie", category);
    if (sort !== "newest") sp.set("sortare", sort);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return `/anunturi${qs ? `?${qs}` : ""}`;
  }

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

      <CategoryFilter
        categories={CATEGORIES}
        active={category}
        basePath="/anunturi"
        extraParams={sort !== "newest" ? { sortare: sort } : undefined}
      />

      {/* Sort + results count bar */}
      <div className="flex items-center justify-between gap-4 mt-5 mb-4">
        <p className="text-sm text-gray-500">
          {total > 0 ? (
            <>{total} {total === 1 ? "anunț" : "anunțuri"}</>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 hidden sm:inline">Sortare:</span>
          <div className="flex gap-1 flex-wrap justify-end">
            {SORT_OPTIONS.map((opt) => {
              const sp = new URLSearchParams();
              if (q) sp.set("q", q);
              if (category) sp.set("categorie", category);
              if (opt.value !== "newest") sp.set("sortare", opt.value);
              const href = `/anunturi${sp.toString() ? `?${sp.toString()}` : ""}`;
              return (
                <Link
                  key={opt.value}
                  href={href}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                    sort === opt.value
                      ? "bg-[#1a1a1a] text-white border-[#1a1a1a]"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {listings.length === 0 ? (
        <p className="text-gray-500 text-center py-20">Nu am găsit anunțuri.</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
