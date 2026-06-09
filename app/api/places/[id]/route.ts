import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

const editSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().min(10).optional(),
  category: z.string().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  website: z.string().url().optional().or(z.literal("")).nullable(),
  imageUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  const { id } = await params;
  const [place] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  if (!place) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const images: string[] = place.imagesJson ? JSON.parse(place.imagesJson) : [];
  return NextResponse.json({ ...place, imageUrl: images[0] ?? null });
}

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
  const d = parsed.data;
  if (d.name !== undefined) update.name = d.name;
  if (d.description !== undefined) update.description = d.description;
  if (d.category !== undefined) update.category = d.category;
  if (d.address !== undefined) update.address = d.address;
  if (d.phone !== undefined) update.phone = d.phone;
  if (d.website !== undefined) update.website = d.website || null;
  if (d.imageUrl !== undefined) update.imagesJson = d.imageUrl ? JSON.stringify([d.imageUrl]) : null;

  await db.update(places).set(update as any).where(eq(places.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const [place] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  if (!place) return NextResponse.json({ error: "Localul nu a fost găsit." }, { status: 404 });

  const images: string[] = place.imagesJson ? JSON.parse(place.imagesJson) : [];
  const fileKeys = images.filter((u) => u.includes("/f/")).map((u) => u.split("/f/")[1]);
  if (fileKeys.length > 0) await new UTApi().deleteFiles(fileKeys).catch(() => {});

  await db.delete(places).where(eq(places.id, id));
  await db.insert(adminAuditLog).values({
    adminId: session.user!.id!,
    action: "delete_place",
    entityType: "place",
    entityId: id,
    metadataJson: JSON.stringify({ name: place.name }),
  });

  return NextResponse.json({ ok: true });
}
