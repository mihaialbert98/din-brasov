import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncJobs } from "@/lib/db/schema";

function verifyCron(req: Request) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const [job] = await db
    .insert(syncJobs)
    .values({ type: "scrape_news", status: "pending" })
    .returning();

  // Trigger the Railway scraper service
  const scraperUrl = process.env.SCRAPER_URL;
  if (scraperUrl) {
    fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(() => {}); // fire and forget
  }

  return NextResponse.json({ ok: true, jobId: job.id });
}
