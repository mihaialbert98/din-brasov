import type { Metadata } from "next";
import { searchNews } from "@/lib/search";
import CategoryFilter from "@/components/ui/CategoryFilter";
import NewsCard from "@/components/ui/NewsCard";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Știri din Brașov",
  description: "Ultimele știri locale din Brașov — actualitate, sport, cultură, business și sănătate.",
  path: "/stiri",
  section: "Știri",
});

const CATEGORIES = ["Actualitate", "Sport", "Cultură", "Business", "Sănătate", "Altele"];

export default async function StiriPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.categorie;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  const { items, total, pageSize } = await searchNews(q, { page, category }).catch(() => ({
    items: [],
    total: 0,
    pageSize: 20,
  }));
  const totalPages = Math.ceil(total / pageSize);

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("categorie", category);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return `/stiri${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="Știri din Brașov"
        subtitle="Actualitate, sport, cultură, business și sănătate — știrile locale, curate."
      />

      <CategoryFilter categories={CATEGORIES} active={category} basePath="/stiri" />

      {items.length === 0 ? (
        <EmptyState message="Nu am găsit știri." hint="Încearcă altă categorie sau revino mai târziu." />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-6">
            {items.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
