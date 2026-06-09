import type { BaseScraper } from "./base-scraper.js";
import { BztvScraper } from "./bztv.js";

// Register all scraper sources here
export const scraperSources: (new () => BaseScraper)[] = [
  BztvScraper,
];
