import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems, adminAuditLog } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";

const schema = z.object({
  title: z.string().min(3).max(200),
  excerpt: z.string().min(10).max(300),
  sourceUrl: z.string().url(),
  sourceName: z.string().min(1).max(100),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

function canCreateNews(role: string) {
  return role === "admin" || role === "moderator";
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || !role || !canCreateNews(role)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const slug = slugifyWithDate(parsed.data.title);

  try {
    await db.insert(newsItems).values({
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      sourceUrl: parsed.data.sourceUrl,
      sourceName: parsed.data.sourceName,
      category: parsed.data.category ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      slug,
      status: "published",
      reviewedBy: session.user.id,
      publishedAt: new Date(),
    });
  } catch (e: any) {
    const msg = e?.message ?? e?.cause?.message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate") || e?.cause?.code === "23505") {
      return NextResponse.json(
        { error: "Un articol cu acest link sursă există deja. Folosește un alt URL." },
        { status: 409 }
      );
    }
    console.error("News insert error:", e);
    return NextResponse.json({ error: "Eroare la salvarea știrii." }, { status: 500 });
  }

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "create_news",
    entityType: "news_item",
    entityId: slug,
    metadataJson: JSON.stringify({ title: parsed.data.title }),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
