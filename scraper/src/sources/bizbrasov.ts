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

export class BizBrasovScraper extends BaseScraper {
  readonly key = "bizbrasov";
  readonly sourceName = "BizBrașov";
  readonly baseUrl = "https://bizbrasov.ro";

  async scrape(): Promise<ScrapedItem[]> {
    const url = `${this.baseUrl}/stiri-brasov/stiri-din-judetul-brasov/`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];

    // Titles are in h2.is-title or h4.is-title inside article.l-post, each wrapped in an <a>
    $("article.l-post").each((_, el) => {
      if (items.length >= 20) return false;

      const titleEl = $(el).find(".is-title a").first();
      const title = titleEl.text().trim();
      const link = titleEl.attr("href");
      if (!title || !link) return;

      const imgSrc =
        $(el).find("img[data-src]").first().attr("data-src") ??
        $(el).find("img").first().attr("src");
      const dateText = $(el).find("time, .entry-date, .date").first().attr("datetime") ??
        $(el).find("time, .entry-date, .date").first().text();
      const publishedAt = parseRomanianDate(dateText) ?? (dateText ? new Date(dateText) : undefined);
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

    return items;
  }
}
