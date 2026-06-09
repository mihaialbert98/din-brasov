import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { experiences, adminAuditLog } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";

const schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  externalUrl: z.string().url({ message: "Link invalid." }),
  category: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }

  const slug = slugifyWithDate(parsed.data.title);

  try {
    await db.insert(experiences).values({
      title: parsed.data.title,
      description: parsed.data.description,
      slug,
      externalUrl: parsed.data.externalUrl,
      category: parsed.data.category ?? null,
      imageUrl: parsed.data.imageUrl || null,
      organizerId: session.user!.id,
      status: "published",
    });
  } catch (e: any) {
    const msg = e?.message ?? e?.cause?.message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate") || e?.cause?.code === "23505") {
      return NextResponse.json({ error: "O experiență cu acest titlu există deja. Schimbă titlul." }, { status: 409 });
    }
    console.error("Experience insert error:", e);
    return NextResponse.json({ error: "Eroare la salvarea experienței." }, { status: 500 });
  }

  await db.insert(adminAuditLog).values({
    adminId: session.user!.id,
    action: "create_experience",
    entityType: "experience",
    entityId: slug,
    metadataJson: JSON.stringify({ title: parsed.data.title }),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
