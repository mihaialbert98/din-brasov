export interface ScrapedItem {
  title: string;
  excerpt: string; // max 300 chars — enforced in db.ts
  sourceUrl: string;
  sourceName: string;
  author?: string;
  publishedAt?: Date;
  imageUrl?: string;
  category?: string;
  slug: string;
}

export abstract class BaseScraper {
  abstract readonly key: string; // used for source filtering
  abstract readonly sourceName: string;
  abstract readonly baseUrl: string;

  abstract scrape(): Promise<ScrapedItem[]>;

  protected slugify(text: string, date?: Date): string {
    const diacritics: Record<string, string> = {
      ă: "a", â: "a", î: "i", ș: "s", ț: "t",
      Ă: "a", Â: "a", Î: "i", Ș: "s", Ț: "t",
      ş: "s", ţ: "t",
    };
    const base = text
      .split("")
      .map((c) => diacritics[c] ?? c)
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    const dateStr = (date ?? new Date()).toISOString().slice(0, 10);
    return `${base}-${dateStr}`;
  }

  protected truncate(text: string, max = 300): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + "…";
  }
}
