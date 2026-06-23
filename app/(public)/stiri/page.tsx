import type { Metadata } from "next";
import { searchNews } from "@/lib/search";
import CategoryFilter from "@/components/ui/CategoryFilter";
import NewsCard from "@/components/ui/NewsCard";
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
  const page = parseInt(params.pagina ?? "1");

  const items = await searchNews(q, { page, category }).catch(() => []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-8">Știri din Brașov</h1>

      <CategoryFilter categories={CATEGORIES} active={category} basePath="/stiri" />

      {items.length === 0 ? (
        <p className="text-gray-500 text-center py-20">Nu am găsit știri.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
