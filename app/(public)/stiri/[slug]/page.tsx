import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

async function getNews(slug: string) {
  const [item] = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.slug, slug))
    .limit(1);
  return item;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getNews(slug);
  if (!item) return {};
  return { title: item.title, description: item.excerpt };
}

export default async function StirePage({ params }: Props) {
  const { slug } = await params;
  const item = await getNews(slug);

  if (!item || item.status !== "published") notFound();

  return (
    <article className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-4">
        <span className="text-sm font-semibold text-[#d4820a] uppercase tracking-wide">
          {item.sourceName}
        </span>
        {item.category && (
          <span className="text-sm text-gray-400"> · {item.category}</span>
        )}
      </div>

      <h1 className="text-3xl font-bold font-serif text-gray-900 mb-4">{item.title}</h1>

      {item.publishedAt && (
        <p className="text-sm text-gray-500 mb-6">{formatDate(item.publishedAt)}</p>
      )}

      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.title}
          className="w-full rounded-xl mb-6 max-h-80 object-cover"
        />
      )}

      <p className="text-lg text-gray-700 leading-relaxed mb-8">{item.excerpt}</p>

      <div className="border-t pt-6">
        <p className="text-sm text-gray-500 mb-3">
          Aceasta este o prezentare succintă a articolului. Citește articolul complet la sursă:
        </p>
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#1a4731] text-white px-5 py-3 rounded-lg hover:bg-[#2d6a4f] transition-colors font-medium"
        >
          Citește la {item.sourceName} →
        </a>
      </div>
    </article>
  );
}
