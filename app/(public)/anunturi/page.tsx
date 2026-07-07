import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { searchListings, type ListingSort } from "@/lib/search";
import { auth } from "@/lib/auth";
import CategoryFilter from "@/components/ui/CategoryFilter";
import ListingCard from "@/components/ui/ListingCard";
import Pagination from "@/components/ui/Pagination";
import SortSelect from "@/components/ui/SortSelect";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Anunțuri Brașov — cumpără și vinde local",
  description: "Anunțuri de vânzare-cumpărare din Brașov, de la oameni reali. Electronice, mobilă, auto, imobiliare și altele — sigur, fără spam.",
  path: "/anunturi",
  section: "Anunțuri",
});

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
      <PageHeader
        title="Anunțuri"
        subtitle="Cumpără și vinde în Brașov — de la oameni reali, fără spam."
        action={
          session ? (
            <Link
              href="/anunturi/nou"
              className="inline-flex items-center gap-1.5 bg-accent text-white font-semibold px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg hover:bg-accent-hover transition-colors text-sm sm:text-base whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden />
              Adaugă anunț
            </Link>
          ) : (
            <Link
              href="/intra"
              className="inline-flex items-center border border-accent text-accent font-semibold px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg hover:bg-accent-soft transition-colors text-sm sm:text-base whitespace-nowrap"
            >
              <span className="hidden sm:inline">Intră în cont pentru a posta</span>
              <span className="sm:hidden">Intră în cont</span>
            </Link>
          )
        }
      />

      <CategoryFilter
        categories={CATEGORIES}
        active={category}
        basePath="/anunturi"
        extraParams={sort !== "newest" ? { sortare: sort } : undefined}
      />

      {/* Sort + results count bar */}
      <div className="flex items-center justify-between gap-4 mt-5 mb-4">
        <p className="text-sm text-muted tabular-nums">
          {total > 0 ? (
            <>{total} {total === 1 ? "anunț" : "anunțuri"}</>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted hidden sm:inline">Sortare:</span>
          <SortSelect
            options={SORT_OPTIONS}
            value={sort}
            basePath="/anunturi"
            extraParams={{
              ...(q ? { q } : {}),
              ...(category ? { categorie: category } : {}),
            }}
          />
        </div>
      </div>

      {listings.length === 0 ? (
        <EmptyState message="Nu am găsit anunțuri." hint="Încearcă altă categorie sau caută altceva." />
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
