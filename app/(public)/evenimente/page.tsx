import type { Metadata } from "next";
import { searchEvents } from "@/lib/search";
import EventCard from "@/components/ui/EventCard";

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
  const events = await searchEvents(params.q ?? "", {
    category: params.categorie,
  }).catch(() => []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] mb-8">
        Evenimente în Brașov
      </h1>
      {events.length === 0 ? (
        <p className="text-gray-500 text-center py-20">Nu există evenimente programate.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
