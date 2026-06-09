import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { experiences, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  const { id } = await params;
  const [exp] = await db.select().from(experiences).where(eq(experiences.id, id)).limit(1);
  if (!exp) return NextResponse.json({ error: "Negăsit" }, { status: 404 });
  return NextResponse.json(exp);
}

const editSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).optional(),
  externalUrl: z.string().url().optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.externalUrl !== undefined) update.externalUrl = parsed.data.externalUrl;
  if (parsed.data.category !== undefined) update.category = parsed.data.category || null;
  if (parsed.data.imageUrl !== undefined) update.imageUrl = parsed.data.imageUrl || null;

  await db.update(experiences).set(update as any).where(eq(experiences.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const [exp] = await db.select().from(experiences).where(eq(experiences.id, id)).limit(1);
  if (!exp) return NextResponse.json({ error: "Experiența nu a fost găsită." }, { status: 404 });

  if (exp.imageUrl?.includes("/f/")) {
    const fileKey = exp.imageUrl.split("/f/")[1];
    await new UTApi().deleteFiles([fileKey]).catch(() => {});
  }

  await db.delete(experiences).where(eq(experiences.id, id));
  await db.insert(adminAuditLog).values({
    adminId: session.user!.id,
    action: "delete_experience",
    entityType: "experience",
    entityId: id,
    metadataJson: JSON.stringify({ title: exp.title }),
  });

  return NextResponse.json({ ok: true });
}
