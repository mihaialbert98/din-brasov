import type { Metadata } from "next";
import { db } from "@/lib/db";
import { experiences } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import CategoryFilter from "@/components/ui/CategoryFilter";

export const metadata: Metadata = {
  title: "Experiențe în Brașov",
  description: "Descoperă activități și experiențe unice în Brașov — aventură, cultură, gastronomie și mai mult.",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Aventură": "bg-orange-100 text-orange-700",
  "Sport": "bg-blue-100 text-blue-700",
  "Cultură": "bg-purple-100 text-purple-700",
  "Gastronomie": "bg-yellow-100 text-yellow-700",
  "Natură": "bg-green-100 text-green-700",
  "Altele": "bg-gray-100 text-gray-700",
};

export default async function ExperientePage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string }>;
}) {
  const params = await searchParams;

  const allExperiences = await db
    .select().from(experiences)
    .where(eq(experiences.status, "published"))
    .orderBy(desc(experiences.createdAt))
    .catch(() => []);

  const filtered = params.categorie
    ? allExperiences.filter((e) => e.category === params.categorie)
    : allExperiences;

  const categories = [...new Set(allExperiences.map((e) => e.category).filter(Boolean))] as string[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-2">Experiențe în Brașov</h1>
      <p className="text-gray-500 mb-8">Activități și aventuri pe care le poți trăi în Brașov</p>

      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          active={params.categorie}
          basePath="/experiente"
          activeColor="terracotta"
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-20">Nu există experiențe disponibile momentan.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((exp) => (
            <Link
              key={exp.id}
              href={`/experiente/${exp.slug}`}
              className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
            >
              {exp.imageUrl ? (
                <img src={exp.imageUrl} alt={exp.title} className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-44 bg-gradient-to-br from-[#e8d9c5] to-[#c84b1e]/20 flex items-center justify-center">
                  <span className="text-4xl">🎯</span>
                </div>
              )}
              <div className="p-4">
                {exp.category && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[exp.category] ?? "bg-gray-100 text-gray-700"}`}>
                    {exp.category}
                  </span>
                )}
                <h2 className="font-semibold text-gray-900 mt-2 line-clamp-2">{exp.title}</h2>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{exp.description}</p>
                <span className="inline-block mt-3 text-sm font-semibold text-[#c84b1e]">
                  Descoperă →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
