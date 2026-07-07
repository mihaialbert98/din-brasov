import { notFound } from "next/navigation";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { CalendarDays, MapPin, Ticket, CheckCircle2, Hourglass, ArrowUpRight } from "lucide-react";
import { formatDate, isOptimizableImage } from "@/lib/utils";
import type { Metadata } from "next";
import Badge from "@/components/ui/Badge";
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

  // An event is "ended" once its end date (or its start, when there's no end) is
  // in the past — same rule the public list and newsletter use to hide it.
  const isEnded = (ev.endsAt ?? ev.startsAt).getTime() < Date.now();

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
        <div className="relative w-full aspect-[16/9] rounded-2xl mb-6 overflow-hidden bg-cream/40">
          <Image src={ev.imageUrl} alt={ev.title} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" unoptimized={!isOptimizableImage(ev.imageUrl)} />
        </div>
      )}
      {isEnded && (
        <div className="flex items-center gap-2 bg-cream/50 border border-hairline text-muted rounded-xl px-4 py-3 mb-4 text-sm font-medium">
          <Hourglass className="w-4 h-4 flex-shrink-0" aria-hidden />
          Acest eveniment s-a încheiat.
        </div>
      )}
      <Badge variant="category" category={ev.category}>
        {ev.category ?? "Eveniment"}
      </Badge>
      <h1 className="text-3xl sm:text-4xl font-semibold font-serif text-ink mt-3 mb-4 leading-tight">{ev.title}</h1>

      <div className="bg-surface rounded-2xl border border-hairline p-5 mb-6 space-y-2.5 text-ink/80">
        <p className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
          <span>{formatDate(ev.startsAt)}{ev.endsAt ? ` — ${formatDate(ev.endsAt)}` : ""}</span>
        </p>
        {ev.locationName && (
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
            <span>{ev.locationName}{ev.address ? `, ${ev.address}` : ""}</span>
          </p>
        )}
        {(ev.isFree || ev.price) && (
          <p className="flex items-center gap-2">
            {ev.isFree ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
            ) : (
              <Ticket className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden />
            )}
            <span className="tabular-nums">
              {ev.isFree ? "Intrare liberă" : `${ev.price} ${ev.currency}`}
            </span>
          </p>
        )}
        {ev.externalUrl && !isEnded && (
          <a
            href={ev.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-accent-hover transition-colors mt-2"
          >
            Mergi la eveniment
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </a>
        )}
      </div>

      <p className="text-ink/80 leading-relaxed whitespace-pre-wrap">{ev.description}</p>
    </article>
  );
}
