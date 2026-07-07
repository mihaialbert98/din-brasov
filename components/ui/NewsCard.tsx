import Link from "next/link";
import Image from "next/image";
import { isOptimizableImage } from "@/lib/utils";
import { cardShell, cardImageFrame, cardImageZoom, eyebrow } from "@/lib/ui";

type Props = {
  item: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    sourceName: string;
    category: string | null;
    imageUrl: string | null;
    publishedAt: Date | null;
  };
  compact?: boolean;
};

export default function NewsCard({ item, compact = false }: Props) {
  const date = item.publishedAt
    ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(item.publishedAt)
      )
    : null;

  if (compact) {
    return (
      <Link href={`/stiri/${item.slug}`} className={cardShell("p-5 flex flex-col gap-2")}>
        <span className={eyebrow}>{item.sourceName}</span>
        <h3 className="font-serif text-lg font-semibold text-ink line-clamp-3 leading-snug">
          {item.title}
        </h3>
      </Link>
    );
  }

  // No cover image → render a deliberate "text story" card instead of an image
  // card with an empty frame. A warm paper background, a larger serif headline and
  // more of the excerpt fill the height so it reads as intentional editorial, not
  // a broken image. The image variant is unchanged.
  if (!item.imageUrl) {
    return (
      <Link
        href={`/stiri/${item.slug}`}
        className={cardShell("flex flex-col bg-cream/30 p-6")}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className={eyebrow}>{item.sourceName}</span>
          {item.category && <span className="text-xs text-faint">· {item.category}</span>}
        </div>
        <h2 className="font-serif text-2xl font-semibold text-ink leading-tight text-balance line-clamp-4">
          {item.title}
        </h2>
        {item.excerpt && (
          <p className="mt-3 text-[15px] text-muted leading-relaxed line-clamp-4">
            {item.excerpt}
          </p>
        )}
        {date && (
          <span className="mt-auto pt-4 text-xs text-faint">{date}</span>
        )}
      </Link>
    );
  }

  return (
    <Link href={`/stiri/${item.slug}`} className={cardShell("flex flex-col")}>
      <div className={cardImageFrame}>
        <Image
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 100vw, 50vw"
          className={cardImageZoom}
          unoptimized={!isOptimizableImage(item.imageUrl)}
        />
      </div>
      <div className="p-5 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-2">
          <span className={eyebrow}>{item.sourceName}</span>
          {item.category && <span className="text-xs text-faint">· {item.category}</span>}
        </div>
        <h2 className="font-serif text-lg font-semibold text-ink line-clamp-3 leading-snug">
          {item.title}
        </h2>
        {item.excerpt && <p className="text-muted text-sm line-clamp-2">{item.excerpt}</p>}
        {date && <span className="mt-auto pt-1 text-xs text-faint">{date}</span>}
      </div>
    </Link>
  );
}
