import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";
import NewsEditForm from "./NewsEditForm";
import NewsDeleteButton from "@/components/admin/NewsDeleteButton";

export const metadata: Metadata = { title: "Admin — Revizuire știre" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewsDetailPage({ params }: Props) {
  const { id } = await params;

  const [item] = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);

  if (!item) notFound();

  const isDraft = item.status === "draft";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/stiri" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          ← Înapoi la știri
        </Link>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          isDraft ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
        }`}>
          {isDraft ? "Draft" : "Publicat"}
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" className="w-full h-56 object-cover" />
        )}
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2 text-xs text-gray-400">
            <span className="font-semibold text-[#c84b1e] uppercase">{item.sourceName}</span>
            {item.category && <span>· {item.category}</span>}
            {(item.scrapedAt ?? item.publishedAt) && (
              <span>
                · {isDraft ? "Scraped" : "Publicat"}: {formatDate(
                  (item.scrapedAt ?? item.publishedAt)!,
                  { day: "numeric", month: "long", year: "numeric" }
                )}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h1>
          <p className="text-sm text-gray-600 mb-4">{item.excerpt}</p>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#6bb5d4] hover:underline"
            >
              Sursa originală →
            </a>
          )}
        </div>
      </div>

      {/* Edit form — available for both draft and published */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">
          {isDraft ? "Editează înainte de publicare" : "Editează articolul"}
        </h2>
        <NewsEditForm
          id={item.id}
          initial={{
            title: item.title,
            excerpt: item.excerpt,
            sourceName: item.sourceName,
            category: item.category,
            imageUrl: item.imageUrl,
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {isDraft && (
          <>
            <form action={`/api/news/${item.id}/approve`} method="POST">
              <button
                type="submit"
                className="bg-green-600 text-white font-semibold px-5 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors"
              >
                Publică
              </button>
            </form>
            <form action={`/api/news/${item.id}/reject`} method="POST">
              <button
                type="submit"
                className="bg-gray-100 text-gray-700 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              >
                Respinge
              </button>
            </form>
          </>
        )}
        <NewsDeleteButton id={item.id} />
      </div>
    </div>
  );
}
