import type { Metadata } from "next";
import { Store } from "lucide-react";
import { searchPlaces } from "@/lib/search";
import PlaceCard from "@/components/ui/PlaceCard";
import CategoryFilter from "@/components/ui/CategoryFilter";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Localuri din Brașov",
  description: "Restaurante, cafenele, magazine și alte localuri noi și recomandate din Brașov.",
  path: "/localuri",
  section: "Localuri",
});

export default async function LocaluriPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.categorie;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  const [result, allPlaces] = await Promise.all([
    searchPlaces(q, { page, category }).catch(() => ({ items: [], total: 0, pageSize: 20 })),
    db.select({ category: places.category }).from(places).where(eq(places.status, "published")),
  ]);

  const { items, total, pageSize } = result;
  const totalPages = Math.ceil(total / pageSize);
  const categories = [...new Set(allPlaces.map((p) => p.category).filter(Boolean))] as string[];

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("categorie", category);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return `/localuri${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="Localuri din Brașov"
        subtitle="Restaurante, cafenele, magazine și alte locuri de descoperit în oraș."
      />

      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          active={params.categorie}
          basePath="/localuri"
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Store className="h-7 w-7" aria-hidden />}
          message={
            params.categorie
              ? `Nu există localuri în categoria „${params.categorie}”.`
              : "Nu există localuri adăugate."
          }
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {items.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
