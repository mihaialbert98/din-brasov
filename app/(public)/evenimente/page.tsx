import type { Metadata } from "next";
import { searchEvents } from "@/lib/search";
import EventCard from "@/components/ui/EventCard";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Evenimente",
  description: "Evenimente în Brașov — concerte, expoziții, târguri și mai mult.",
};

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
        <div className="flex flex-wrap gap-2 mb-8">
          <Link
            href="/evenimente"
            className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
              !params.categorie ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Toate
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/evenimente?categorie=${encodeURIComponent(cat)}`}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                params.categorie === cat ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      )}

      {evList.length === 0 ? (
        <p className="text-gray-500 text-center py-20">
          {params.categorie ? `Nu există evenimente în categoria „${params.categorie}".` : "Nu există evenimente programate."}
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {evList.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
