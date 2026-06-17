import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { guessNewsCategory } from "@/lib/categorize-news";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  // Safety net: a draft may reach approval still uncategorized (older scrape, or
  // moderator didn't pick one). Never publish a NULL category — it would be
  // invisible to every filter button on /stiri. Guess one from the content.
  const [item] = await db
    .select({ title: newsItems.title, excerpt: newsItems.excerpt, sourceName: newsItems.sourceName, category: newsItems.category })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);

  const category = item?.category ?? guessNewsCategory(item?.title, item?.excerpt, item?.sourceName);

  await db.update(newsItems).set({ status: "published", category, publishedAt: new Date(), reviewedBy: session!.user!.id!, updatedAt: new Date() }).where(eq(newsItems.id, id));

  await db.insert(adminAuditLog).values({
    adminId: session!.user!.id!,
    action: "approve_news",
    entityType: "news_item",
    entityId: id,
  });

  return NextResponse.redirect(new URL("/admin/stiri", req.url));
}
