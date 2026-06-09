import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(_req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const items = await db
    .select({ id: newsItems.id, title: newsItems.title, imageUrl: newsItems.imageUrl })
    .from(newsItems)
    .where(and(eq(newsItems.status, "published"), lt(newsItems.publishedAt, cutoff)));

  if (items.length === 0) return NextResponse.json({ deleted: 0 });

  const fileKeys = items
    .map((i) => i.imageUrl?.split("/f/")[1])
    .filter((k): k is string => !!k);
  if (fileKeys.length > 0) await new UTApi().deleteFiles(fileKeys);

  await db.delete(newsItems).where(
    and(eq(newsItems.status, "published"), lt(newsItems.publishedAt, cutoff))
  );

  await db.insert(adminAuditLog).values(
    items.map((item) => ({
      adminId: session.user!.id!,
      action: "delete_news",
      entityType: "news_item",
      entityId: item.id,
      metadataJson: JSON.stringify({ title: item.title, imageUrl: item.imageUrl, reason: "bulk_delete_old" }),
    }))
  );

  return NextResponse.json({ deleted: items.length });
}
