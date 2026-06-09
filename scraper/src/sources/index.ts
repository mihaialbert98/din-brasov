import type { BaseScraper } from "./base-scraper.js";
import { BizBrasovScraper } from "./bizbrasov.js";
import { BrasovNetScraper } from "./brasovnet.js";
import { MyTexScraper } from "./mytex.js";

export const scraperSources: (new () => BaseScraper)[] = [
  BizBrasovScraper,
  BrasovNetScraper,
  MyTexScraper,
];
