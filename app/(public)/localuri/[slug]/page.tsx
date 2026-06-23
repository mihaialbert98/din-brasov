import { notFound } from "next/navigation";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { pageMetadata, localBusinessJsonLd, breadcrumbJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

async function getPlace(slug: string) {
  const [item] = await db.select().from(places).where(eq(places.slug, slug)).limit(1);
  return item;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlace(slug);
  if (!place || place.status !== "published") return { title: "Local negăsit" };
  const images: string[] = place.imagesJson ? JSON.parse(place.imagesJson) : [];
  return pageMetadata({
    title: place.name,
    description: place.description,
    path: `/localuri/${place.slug}`,
    image: images[0],
    section: "Localuri",
  });
}

export default async function LocalPage({ params }: Props) {
  const { slug } = await params;
  const place = await getPlace(slug);

  if (!place || place.status !== "published") notFound();

  const images: string[] = place.imagesJson ? JSON.parse(place.imagesJson) : [];

  return (
    <article className="max-w-2xl mx-auto px-4 py-10">
      <JsonLd
        data={[
          localBusinessJsonLd({
            name: place.name,
            description: place.description,
            path: `/localuri/${place.slug}`,
            category: place.category,
            address: place.address,
            phone: place.phone,
            website: place.website,
            image: images[0],
            latitude: place.latitude,
            longitude: place.longitude,
          }),
          breadcrumbJsonLd([
            { name: "Acasă", path: "/" },
            { name: "Localuri", path: "/localuri" },
            { name: place.name, path: `/localuri/${place.slug}` },
          ]),
        ]}
      />
      {images[0] && (
        <div className="relative w-full h-80 rounded-xl mb-6 overflow-hidden">
          <Image src={images[0]} alt={place.name} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
        </div>
      )}
      {place.category && (
        <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
          {place.category}
        </span>
      )}
      <h1 className="text-3xl font-bold font-serif text-gray-900 mt-3 mb-4">{place.name}</h1>

      <div className="bg-white rounded-xl p-5 mb-6 shadow-sm space-y-2 text-gray-700">
        {place.address && <p>📍 {place.address}</p>}
        {place.phone && (
          <a href={`tel:${place.phone}`} className="flex items-center gap-2 hover:underline">
            📞 {place.phone}
          </a>
        )}
        {place.website && (
          <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-[#d4820a] hover:underline">
            🌐 {place.website}
          </a>
        )}
      </div>

      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{place.description}</p>
    </article>
  );
}
