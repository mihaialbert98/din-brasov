import Link from "next/link";
import Image from "next/image";
import { isOptimizableImage } from "@/lib/utils";

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
      <Link
        href={`/stiri/${item.slug}`}
        className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-2 border border-[#e8d9c5]"
      >
        <span className="text-xs text-[#c84b1e] font-semibold uppercase tracking-wide">
          {item.sourceName}
        </span>
        <h3 className="font-semibold text-gray-900 line-clamp-3">{item.title}</h3>
      </Link>
    );
  }

  return (
    <Link
      href={`/stiri/${item.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3"
    >
      {item.imageUrl && (
        <div className="relative w-full h-48 rounded-lg overflow-hidden">
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover"
            unoptimized={!isOptimizableImage(item.imageUrl)}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#d4820a] uppercase tracking-wide">
          {item.sourceName}
        </span>
        {item.category && <span className="text-xs text-gray-400">· {item.category}</span>}
      </div>
      <h2 className="text-lg font-semibold text-gray-900 line-clamp-3">{item.title}</h2>
      {item.excerpt && <p className="text-gray-600 text-sm line-clamp-2">{item.excerpt}</p>}
      {date && <span className="text-xs text-gray-400">{date}</span>}
    </Link>
  );
}
