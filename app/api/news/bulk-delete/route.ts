import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

const schema = z.object({ ids: z.array(z.string()).min(1).max(200) });

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const { ids } = parsed.data;

  const items = await db
    .select({ id: newsItems.id, title: newsItems.title, imageUrl: newsItems.imageUrl })
    .from(newsItems)
    .where(inArray(newsItems.id, ids));

  if (items.length === 0) return NextResponse.json({ deleted: 0 });

  const fileKeys = items
    .map((i) => i.imageUrl?.split("/f/")[1])
    .filter((k): k is string => !!k);
  if (fileKeys.length > 0) await new UTApi().deleteFiles(fileKeys);

  await db.delete(newsItems).where(inArray(newsItems.id, ids));

  await db.insert(adminAuditLog).values(
    items.map((item) => ({
      adminId: session.user!.id!,
      action: "delete_news",
      entityType: "news_item",
      entityId: item.id,
      metadataJson: JSON.stringify({ title: item.title, imageUrl: item.imageUrl }),
    }))
  );

  return NextResponse.json({ deleted: items.length });
}
