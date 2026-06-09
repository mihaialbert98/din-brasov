import * as cheerio from "cheerio";
import { BaseScraper, type ScrapedItem } from "./base-scraper.js";

function parseRelativeDate(text: string): Date {
  const t = text.trim().toLowerCase();
  const now = Date.now();
  const minMatch = t.match(/acum (\d+) de? minut/);
  const hourMatch = t.match(/acum (\d+) de? or/);
  const dayMatch = t.match(/acum (\d+) de? zi/);
  if (minMatch) return new Date(now - parseInt(minMatch[1]) * 60_000);
  if (hourMatch) return new Date(now - parseInt(hourMatch[1]) * 3_600_000);
  if (dayMatch) return new Date(now - parseInt(dayMatch[1]) * 86_400_000);
  return new Date();
}

export class BrasovNetScraper extends BaseScraper {
  readonly key = "brasovnet";
  readonly sourceName = "Brașov.net";
  readonly baseUrl = "https://www.brasov.net";

  async scrape(): Promise<ScrapedItem[]> {
    const url = `${this.baseUrl}/stiri-brasov/`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];

    // Each article is in li.mvp-blog-story-wrap > a (the whole card is a link)
    // Title is in .mvp-blog-story-text h2
    // Date is in .mvp-cd-date
    $("li.mvp-blog-story-wrap").each((_, el) => {
      if (items.length >= 20) return false;

      const link = $(el).find("a").first().attr("href");
      const title = $(el).find(".mvp-blog-story-text h2").first().text().trim();
      if (!title || !link) return;

      const imgSrc =
        $(el).find("img").first().attr("data-lazy-src") ??
        $(el).find("img").first().attr("src");
      const dateText = $(el).find(".mvp-cd-date").first().text().trim();
      const publishedAt = parseRelativeDate(dateText);
      const excerpt = this.truncate($(el).find(".mvp-blog-story-text p").first().text().trim() || title);

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
