import { notFound } from "next/navigation";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { MapPin, Phone, Globe } from "lucide-react";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import type { Metadata } from "next";
import Badge from "@/components/ui/Badge";
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
        <div className="relative w-full aspect-[16/9] rounded-2xl mb-6 overflow-hidden bg-cream/40">
          <Image src={images[0]} alt={place.name} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
        </div>
      )}
      {place.category && (
        <Badge variant="category" category={place.category}>
          {place.category}
        </Badge>
      )}
      <h1 className="text-3xl sm:text-4xl font-semibold font-serif text-ink mt-3 mb-4 leading-tight">{place.name}</h1>

      <div className="bg-surface rounded-2xl border border-hairline p-5 mb-6 space-y-2.5 text-ink/80">
        {place.address && (
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
            <span>{place.address}</span>
          </p>
        )}
        {place.phone && (
          <a href={`tel:${place.phone}`} className="flex items-center gap-2 hover:text-accent transition-colors">
            <Phone className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
            <span>{place.phone}</span>
          </a>
        )}
        {place.website && (
          <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent hover:text-accent-hover transition-colors">
            <Globe className="w-4 h-4 flex-shrink-0" aria-hidden />
            <span className="truncate">{place.website}</span>
          </a>
        )}
      </div>

      <p className="text-ink/80 leading-relaxed whitespace-pre-wrap">{place.description}</p>
    </article>
  );
}
