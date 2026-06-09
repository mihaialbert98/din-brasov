import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs } from "@/lib/db/schema";

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sources: string[] = Array.isArray(body.sources) ? body.sources : [];

  const [job] = await db
    .insert(syncJobs)
    .values({ type: "scrape_news", status: "pending" })
    .returning();

  const scraperUrl = process.env.SCRAPER_URL;
  if (scraperUrl) {
    fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId: job.id, sources: sources.length > 0 ? sources : undefined }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, jobId: job.id, startedAt: job.createdAt });
}
