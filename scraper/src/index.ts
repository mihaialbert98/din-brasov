import express from "express";
import { scraperSources } from "./sources/index.js";
import { insertNewsItems } from "./db.js";

const app = express();
app.use(express.json());

function verifySecret(req: express.Request, res: express.Response): boolean {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

app.post("/scrape", async (req, res) => {
  if (!verifySecret(req, res)) return;

  const jobId: string | undefined = req.body?.jobId;
  const requestedSources: string[] | undefined = req.body?.sources;

  const results: { source: string; count: number; error?: string }[] = [];

  for (const Source of scraperSources) {
    const scraper = new Source();
    // If sources filter provided, only run requested scrapers
    if (requestedSources && !requestedSources.includes(scraper.key)) continue;
    try {
      const items = await scraper.scrape();
      const inserted = await insertNewsItems(items);
      results.push({ source: scraper.sourceName, count: inserted });
    } catch (err) {
      results.push({
        source: scraper.sourceName,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("Scrape complete:", { jobId, results });
  res.json({ ok: true, jobId, results });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => console.log(`Scraper listening on :${PORT}`));
