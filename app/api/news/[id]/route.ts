import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

const schema = z.object({
  title: z.string().min(3).max(200).optional(),
  excerpt: z.string().min(10).max(300).optional(),
  sourceName: z.string().min(1).max(100).optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [item] = await db
    .select({ status: newsItems.status })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);

  if (!item) return NextResponse.json({ error: "Știrea nu există." }, { status: 404 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.excerpt !== undefined) updates.excerpt = parsed.data.excerpt;
  if (parsed.data.sourceName !== undefined) updates.sourceName = parsed.data.sourceName;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.imageUrl !== undefined) updates.imageUrl = parsed.data.imageUrl;

  await db.update(newsItems).set(updates).where(eq(newsItems.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [item] = await db
    .select({ title: newsItems.title, imageUrl: newsItems.imageUrl })
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);

  if (!item) return NextResponse.json({ error: "Știrea nu există." }, { status: 404 });

  if (item.imageUrl) {
    const fileKey = item.imageUrl.split("/f/")[1];
    if (fileKey) await new UTApi().deleteFiles([fileKey]);
  }

  await db.delete(newsItems).where(eq(newsItems.id, id));

  await db.insert(adminAuditLog).values({
    adminId: session.user!.id!,
    action: "delete_news",
    entityType: "news_item",
    entityId: id,
    metadataJson: JSON.stringify({ title: item.title, imageUrl: item.imageUrl }),
  });

  return NextResponse.json({ ok: true });
}
