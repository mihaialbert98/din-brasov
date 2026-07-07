import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { searchEvents } from "@/lib/search";
import EventCard from "@/components/ui/EventCard";
import CategoryFilter from "@/components/ui/CategoryFilter";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
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
  searchParams: Promise<{ q?: string; categorie?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.categorie;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  const [result, allEvents] = await Promise.all([
    searchEvents(q, { page, category }).catch(() => ({ items: [], total: 0, pageSize: 20 })),
    db.select({ category: events.category }).from(events).where(eq(events.status, "published")),
  ]);

  const { items: evList, total, pageSize } = result;
  const totalPages = Math.ceil(total / pageSize);
  const categories = [...new Set(allEvents.map((e) => e.category).filter(Boolean))] as string[];

  function buildHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("categorie", category);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return `/evenimente${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="Evenimente în Brașov"
        subtitle="Concerte, expoziții, târguri și tot ce se întâmplă în oraș."
      />

      {categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          active={params.categorie}
          basePath="/evenimente"
        />
      )}

      {evList.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" aria-hidden />}
          message={
            params.categorie
              ? `Nu există evenimente în categoria „${params.categorie}”.`
              : "Nu există evenimente programate."
          }
          hint="Revino curând — programul se actualizează des."
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-6">
            {evList.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </div>
  );
}
