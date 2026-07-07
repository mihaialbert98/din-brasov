import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { db } from "@/lib/db";
import { experiences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { searchExperiences } from "@/lib/search";
import CategoryFilter from "@/components/ui/CategoryFilter";
import ExperienceCard from "@/components/ui/ExperienceCard";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";

export const metadata: Metadata = {
  title: "Experiențe în Brașov",
  description: "Descoperă activități și experiențe unice în Brașov — aventură, cultură, gastronomie și mai mult.",
};

export default async function ExperientePage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const category = params.categorie;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  const [result, allCategories] = await Promise.all([
    searchExperiences("", { page, category }).catch(() => ({ items: [], total: 0, pageSize: 20 })),
    // Category list spans all published experiences, not just the current page.
    db
      .select({ category: experiences.category })
      .from(experiences)
      .where(eq(experiences.status, "published"))
      .catch(() => []),
  ]);

  const { items, total, pageSize } = result;
  const totalPages = Math.ceil(total / pageSize);
  const categories = [...new Set(allCategories.map((e) => e.category).filter(Boolean))] as string[];

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (category) sp.set("categorie", category);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return `/experiente${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="Experiențe în Brașov"
        subtitle="Activități și aventuri pe care le poți trăi chiar aici, în oraș și în împrejurimi."
      />

      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          active={category}
          basePath="/experiente"
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-7 w-7" aria-hidden />}
          message="Nu există experiențe disponibile momentan."
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((exp) => (
              <ExperienceCard key={exp.id} experience={exp} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
