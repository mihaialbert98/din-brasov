import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { ScrapedItem } from "./sources/base-scraper.js";

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}

export async function insertNewsItems(items: ScrapedItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const db = getDb();

  let inserted = 0;
  for (const item of items) {
    try {
      // Raw SQL for upsert — ON CONFLICT DO NOTHING deduplicates by source_url
      await db.execute(
        `INSERT INTO news_items
           (id, title, excerpt, source_url, source_name, author, published_at, image_url, category, slug, status, scraped_at, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW(), NOW(), NOW())
         ON CONFLICT (source_url) DO NOTHING` as any,
        [
          item.title,
          item.excerpt.slice(0, 300), // enforce max 300 chars
          item.sourceUrl,
          item.sourceName,
          item.author ?? null,
          item.publishedAt ?? null,
          item.imageUrl ?? null,
          item.category ?? null,
          item.slug,
        ]
      );
      inserted++;
    } catch {
      // Skip items that fail (e.g., slug collision) — log in production
    }
  }
  return inserted;
}
