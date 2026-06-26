import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { guessNewsCategory } from "@/lib/categorize-news";
import { normalizeTitle } from "@/lib/text";

export const maxDuration = 60;

const schema = z.object({
  mode: z.enum(["all", "new", "non_overlap", "selected"]),
  ids: z.array(z.string()).max(500).optional(),
});

// "Newly scraped" = drafts scraped within this window of the most recent scrape
// (a single scrape batch inserts rows near-simultaneously).
const NEW_BATCH_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const { mode, ids } = parsed.data;

  // Load all drafts (the publishable universe) + the set of published titles for
  // duplicate detection. The publish set is resolved SERVER-SIDE from these — the
  // client only supplies explicit ids for the "selected" mode.
  const [drafts, publishedTitles] = await Promise.all([
    db
      .select({
        id: newsItems.id,
        title: newsItems.title,
        excerpt: newsItems.excerpt,
        sourceName: newsItems.sourceName,
        category: newsItems.category,
        scrapedAt: newsItems.scrapedAt,
      })
      .from(newsItems)
      .where(eq(newsItems.status, "draft")),
    db
      .select({ title: newsItems.title })
      .from(newsItems)
      .where(eq(newsItems.status, "published")),
  ]);

  const publishedSet = new Set(publishedTitles.map((p) => normalizeTitle(p.title)));
  const isDuplicate = (title: string) => publishedSet.has(normalizeTitle(title));

  // Latest scrape batch boundary (for "new" mode).
  const latestScrape = drafts.reduce<number>((max, d) => {
    const t = d.scrapedAt ? new Date(d.scrapedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  let targets = drafts;
  switch (mode) {
    case "all":
      // All drafts, duplicates excluded by default.
      targets = drafts.filter((d) => !isDuplicate(d.title));
      break;
    case "new":
      // Latest scrape batch, duplicates excluded.
      targets = drafts.filter(
        (d) =>
          d.scrapedAt != null &&
          new Date(d.scrapedAt).getTime() >= latestScrape - NEW_BATCH_WINDOW_MS &&
          !isDuplicate(d.title)
      );
      break;
    case "non_overlap":
      // Explicitly only the non-duplicate drafts.
      targets = drafts.filter((d) => !isDuplicate(d.title));
      break;
    case "selected": {
      // Only the provided ids — but they must be real drafts (server-validated).
      const idSet = new Set(ids ?? []);
      targets = drafts.filter((d) => idSet.has(d.id));
      break;
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ published: 0, skippedDuplicates: 0 });
  }

  const now = new Date();
  const adminId = session.user.id;

  // Publish each, guessing a category when missing (same rule as single approve).
  for (const d of targets) {
    const category = d.category ?? guessNewsCategory(d.title, d.excerpt, d.sourceName);
    await db
      .update(newsItems)
      .set({ status: "published", category, publishedAt: now, reviewedBy: adminId, updatedAt: now })
      .where(eq(newsItems.id, d.id));
  }

  await db.insert(adminAuditLog).values(
    targets.map((d) => ({
      adminId,
      action: "bulk_publish_news",
      entityType: "news_item",
      entityId: d.id,
      metadataJson: JSON.stringify({ mode }),
    }))
  );

  // How many drafts were skipped specifically because they were duplicates
  // (only meaningful for the auto-exclude modes).
  const skippedDuplicates =
    mode === "all" || mode === "new" || mode === "non_overlap"
      ? drafts.filter((d) => isDuplicate(d.title)).length
      : 0;

  return NextResponse.json({ published: targets.length, skippedDuplicates });
}
