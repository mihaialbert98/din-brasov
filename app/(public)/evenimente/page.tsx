import type { Metadata } from "next";
import { searchEvents } from "@/lib/search";
import EventCard from "@/components/ui/EventCard";
import CategoryFilter from "@/components/ui/CategoryFilter";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Evenimente în Brașov",
  description: "Evenimente în Brașov — concerte, expoziții, târguri și alte activități. Vezi ce se întâmplă în oraș.",
  path: "/evenimente",
  section: "Evenimente",
});

export default async function EvenimentePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string }>;
}) {
  const params = await searchParams;

  const [evList, allEvents] = await Promise.all([
    searchEvents(params.q ?? "", { category: params.categorie }).catch(() => []),
    db.select({ category: events.category }).from(events).where(eq(events.status, "published")),
  ]);

  const categories = [...new Set(allEvents.map((e) => e.category).filter(Boolean))] as string[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-2">
        Evenimente în Brașov
      </h1>
      <p className="text-gray-500 mb-6">Concerte, expoziții, târguri și alte evenimente</p>

      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          active={params.categorie}
          basePath="/evenimente"
          activeColor="terracotta"
        />
      )}

      {evList.length === 0 ? (
        <p className="text-gray-500 text-center py-20">
          {params.categorie ? `Nu există evenimente în categoria „${params.categorie}".` : "Nu există evenimente programate."}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6">
          {evList.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
