import { notFound } from "next/navigation";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { formatDate, isOptimizableImage } from "@/lib/utils";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { pageMetadata, eventJsonLd, breadcrumbJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

async function getEvent(slug: string) {
  const [ev] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return ev;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEvent(slug);
  if (!ev || ev.status !== "published") return { title: "Eveniment negăsit" };
  return pageMetadata({
    title: ev.title,
    description: ev.description,
    path: `/evenimente/${ev.slug}`,
    image: ev.imageUrl ?? undefined,
    type: "article",
    section: "Evenimente",
  });
}

export default async function EvenimentPage({ params }: Props) {
  const { slug } = await params;
  const ev = await getEvent(slug);

  if (!ev || ev.status !== "published") notFound();

  return (
    <article className="max-w-2xl mx-auto px-4 py-10">
      <JsonLd
        data={[
          eventJsonLd({
            title: ev.title,
            description: ev.description,
            path: `/evenimente/${ev.slug}`,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            locationName: ev.locationName,
            address: ev.address,
            image: ev.imageUrl,
            isFree: ev.isFree,
            price: ev.price,
            currency: ev.currency,
          }),
          breadcrumbJsonLd([
            { name: "Acasă", path: "/" },
            { name: "Evenimente", path: "/evenimente" },
            { name: ev.title, path: `/evenimente/${ev.slug}` },
          ]),
        ]}
      />
      {ev.imageUrl && (
        <div className="relative w-full h-80 rounded-xl mb-6 overflow-hidden">
          <Image src={ev.imageUrl} alt={ev.title} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" unoptimized={!isOptimizableImage(ev.imageUrl)} />
        </div>
      )}
      <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
        {ev.category ?? "Eveniment"}
      </span>
      <h1 className="text-3xl font-bold font-serif text-gray-900 mt-3 mb-4">{ev.title}</h1>

      <div className="bg-white rounded-xl p-5 mb-6 shadow-sm space-y-2 text-gray-700">
        <p>📅 {formatDate(ev.startsAt)}{ev.endsAt ? ` — ${formatDate(ev.endsAt)}` : ""}</p>
        {ev.locationName && <p>📍 {ev.locationName}{ev.address ? `, ${ev.address}` : ""}</p>}
        <p>
          {ev.isFree ? "✅ Intrare liberă" : ev.price ? `🎟️ ${ev.price} ${ev.currency}` : ""}
        </p>
        {ev.externalUrl && (
          <a
            href={ev.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#c84b1e] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#d9603a] transition-colors mt-2"
          >
            Mergi la eveniment →
          </a>
        )}
      </div>

      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{ev.description}</p>
    </article>
  );
}
