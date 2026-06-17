import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Allow this serverless function to run long enough for a Render cold start
// (Vercel Hobby caps maxDuration at 60s; Pro allows more).
export const maxDuration = 60;

// Keep the upstream fetch just under the function budget.
const SCRAPE_TIMEOUT_MS = 55_000;

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const scraperUrl = process.env.SCRAPER_URL;
  if (!scraperUrl) {
    return NextResponse.json(
      { error: "Scraper-ul nu este configurat. Lipsește SCRAPER_URL." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sources: string[] = Array.isArray(body.sources) ? body.sources : [];

  const [job] = await db
    .insert(syncJobs)
    .values({ type: "scrape_news", status: "running", startedAt: new Date() })
    .returning();

  // Run synchronously so we can return the real per-source counts and a clear
  // error if it fails — no fire-and-forget, no client-side polling guesswork.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    const res = await fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId: job.id, sources: sources.length > 0 ? sources : undefined }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      await db
        .update(syncJobs)
        .set({ status: "error", finishedAt: new Date(), error: `HTTP ${res.status}` })
        .where(eq(syncJobs.id, job.id));
      return NextResponse.json(
        { error: `Scraper-ul a returnat o eroare (${res.status}).` },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({}));
    const results: { source: string; count: number; error?: string }[] = data.results ?? [];
    const total = results.reduce((sum, r) => sum + (r.count ?? 0), 0);

    await db
      .update(syncJobs)
      .set({ status: "done", finishedAt: new Date(), metaJson: JSON.stringify(results) })
      .where(eq(syncJobs.id, job.id));

    return NextResponse.json({ ok: true, jobId: job.id, total, results });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    await db
      .update(syncJobs)
      .set({ status: "error", finishedAt: new Date(), error: aborted ? "timeout" : "fetch_failed" })
      .where(eq(syncJobs.id, job.id));
    return NextResponse.json(
      {
        error: aborted
          ? "Scraper-ul nu a răspuns la timp (poate porni lent prima dată). Încearcă din nou."
          : "Nu s-a putut contacta scraper-ul. Încearcă din nou.",
      },
      { status: 504 }
    );
  }
}
