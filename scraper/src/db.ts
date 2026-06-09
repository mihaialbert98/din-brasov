import { neon } from "@neondatabase/serverless";
import type { ScrapedItem } from "./sources/base-scraper.js";

function getSql() {
  return neon(process.env.DATABASE_URL!);
}

export async function insertNewsItems(items: ScrapedItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const sql = getSql();

  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recent = items.filter((item) => !item.publishedAt || item.publishedAt >= cutoff);
  console.log(`  inserting ${recent.length}/${items.length} items (after 3-day cutoff)`);

  let inserted = 0;
  let slug_suffix = 0;
  for (const item of recent) {
    let slug = item.slug;
    let attempts = 0;
    while (attempts < 5) {
      try {
        const rows = await sql`
          INSERT INTO news_items
            (id, title, excerpt, source_url, source_name, author, published_at, image_url, category, slug, status, scraped_at, created_at, updated_at)
          VALUES
            (gen_random_uuid(), ${item.title}, ${item.excerpt.slice(0, 300)}, ${item.sourceUrl}, ${item.sourceName}, ${item.author ?? null}, ${item.publishedAt ?? null}, ${item.imageUrl ?? null}, ${item.category ?? null}, ${slug}, 'draft', NOW(), NOW(), NOW())
          ON CONFLICT (source_url) DO NOTHING
          RETURNING id
        `;
        if (rows.length > 0) inserted++;
        break;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("slug")) {
          attempts++;
          slug_suffix++;
          slug = `${item.slug}-${slug_suffix}`;
        } else {
          console.error(`  failed: "${item.title.slice(0, 50)}" — ${msg}`);
          break;
        }
      }
    }
  }

  console.log(`  inserted ${inserted} new items`);
  return inserted;
}
