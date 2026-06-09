import * as cheerio from "cheerio";
import { BaseScraper, type ScrapedItem } from "./base-scraper.js";

const MONTHS: Record<string, number> = {
  ianuarie: 0, februarie: 1, martie: 2, aprilie: 3, mai: 4, iunie: 5,
  iulie: 6, august: 7, septembrie: 8, octombrie: 9, noiembrie: 10, decembrie: 11,
};

function parseRomanianDate(text: string): Date | undefined {
  const m = text.trim().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return undefined;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return undefined;
  return new Date(parseInt(m[3]), month, parseInt(m[1]));
}

export class MyTexScraper extends BaseScraper {
  readonly key = "mytex";
  readonly sourceName = "MyTex.ro";
  readonly baseUrl = "https://mytex.ro";

  async scrape(): Promise<ScrapedItem[]> {
    const seen = new Set<string>();
    const items: ScrapedItem[] = [];

    try {
      const res = await fetch(`${this.baseUrl}/?s=brasov`, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);

      $("li.post-item").each((_, el) => {
        if (items.length >= 20) return false;

        const titleEl = $(el).find("h2.post-title a").first();
        const title = titleEl.text().trim();
        const link = titleEl.attr("href");
        if (!title || !link || seen.has(link)) return;
        seen.add(link);

        const imgSrc =
          $(el).find("img.wp-post-image").first().attr("src") ??
          $(el).find("img").first().attr("src");
        const dateText = $(el).find(".date, .entry-date, .posted-on, .post-date").first().text().trim();
        const publishedAt = parseRomanianDate(dateText) ?? new Date();
        const excerpt = this.truncate($(el).find("p").first().text().trim() || title);

        items.push({
          title,
          excerpt,
          sourceUrl: link.startsWith("http") ? link : `${this.baseUrl}${link}`,
          sourceName: this.sourceName,
          imageUrl: imgSrc,
          publishedAt,
          slug: this.slugify(title, publishedAt),
        });
      });
    } catch {
      // network error — return what we have
    }

    return items;
  }
}
