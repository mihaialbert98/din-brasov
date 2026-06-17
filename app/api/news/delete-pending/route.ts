import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

/**
 * Deletes ALL pending (draft) news items in one action — used by the
 * "Șterge toate" button on the review queue. Cleans up Uploadthing images
 * and writes one audit-log row per deleted item.
 */
export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const items = await db
    .select({ id: newsItems.id, title: newsItems.title, imageUrl: newsItems.imageUrl })
    .from(newsItems)
    .where(eq(newsItems.status, "draft"));

  if (items.length === 0) return NextResponse.json({ deleted: 0 });

  const fileKeys = items
    .map((i) => i.imageUrl?.split("/f/")[1])
    .filter((k): k is string => !!k);
  if (fileKeys.length > 0) {
    await new UTApi().deleteFiles(fileKeys).catch(() => {});
  }

  await db.delete(newsItems).where(eq(newsItems.status, "draft"));

  await db.insert(adminAuditLog).values(
    items.map((item) => ({
      adminId: session.user!.id!,
      action: "delete_news",
      entityType: "news_item",
      entityId: item.id,
      metadataJson: JSON.stringify({ title: item.title, imageUrl: item.imageUrl, bulk: "pending" }),
    }))
  );

  return NextResponse.json({ deleted: items.length });
}
