import { chromium } from "playwright";
// @ts-ignore — robots-parser has no types bundled
import robotsParser from "robots-parser";
import { BaseScraper, type ScrapedItem } from "./base-scraper.js";

export class BztvScraper extends BaseScraper {
  readonly sourceName = "BZT.ro";
  readonly baseUrl = "https://www.bzt.ro";

  async scrape(): Promise<ScrapedItem[]> {
    // 1. Check robots.txt first
    const robotsUrl = `${this.baseUrl}/robots.txt`;
    let robotsContent = "";
    try {
      const r = await fetch(robotsUrl);
      robotsContent = await r.text();
    } catch {
      console.warn(`Could not fetch robots.txt for ${this.sourceName}`);
    }

    const robots = robotsParser(robotsUrl, robotsContent);
    if (!robots.isAllowed(`${this.baseUrl}/`, "DinBrasovBot")) {
      console.log(`${this.sourceName} disallows crawling — skipping.`);
      return [];
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "User-Agent": "DinBrasovBot/1.0 (+https://dinbrasov.ro/bot)" });

    const items: ScrapedItem[] = [];

    try {
      await page.goto(`${this.baseUrl}/brasov`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector("article, .article-item, .post", { timeout: 10000 });

      const articles = await page.$$eval(
        "article, .article-item",
        (els) =>
          els.slice(0, 20).map((el) => {
            const titleEl = el.querySelector("h2 a, h3 a, .title a");
            const imgEl = el.querySelector("img");
            const timeEl = el.querySelector("time");

            return {
              title: titleEl?.textContent?.trim() ?? "",
              href: (titleEl as HTMLAnchorElement)?.href ?? "",
              imageUrl: (imgEl as HTMLImageElement)?.src ?? "",
              publishedAt: timeEl?.getAttribute("datetime") ?? "",
            };
          })
      );

      for (const article of articles) {
        if (!article.title || !article.href) continue;

        // Scrape individual article page for excerpt
        let excerpt = "";
        try {
          const articlePage = await browser.newPage();
          await articlePage.goto(article.href, { waitUntil: "domcontentloaded", timeout: 20000 });
          await articlePage.waitForSelector("p", { timeout: 5000 });
          excerpt = await articlePage.$eval(
            "article p, .article-body p, .content p",
            (el) => el.textContent?.trim() ?? ""
          ).catch(() => "");
          await articlePage.close();
        } catch {
          excerpt = article.title; // Fallback to title
        }

        const publishedAt = article.publishedAt ? new Date(article.publishedAt) : undefined;
        items.push({
          title: article.title,
          excerpt: this.truncate(excerpt),
          sourceUrl: article.href,
          sourceName: this.sourceName,
          imageUrl: article.imageUrl || undefined,
          publishedAt,
          slug: this.slugify(article.title, publishedAt),
        });
      }
    } finally {
      await browser.close();
    }

    return items;
  }
}
