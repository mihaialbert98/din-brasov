import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  const { id } = await params;
  const [ev] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!ev) return NextResponse.json({ error: "Negăsit" }, { status: 404 });
  return NextResponse.json(ev);
}

const editSchema = z.object({
  title: z.string().min(3, "Titlul trebuie să aibă cel puțin 3 caractere.").max(200).optional(),
  description: z.string().min(10, "Descrierea trebuie să aibă cel puțin 10 caractere.").optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional().nullable(),
  locationName: z.string().max(200).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  category: z.string().optional().nullable(),
  externalUrl: z.string().url().optional().or(z.literal("")).nullable(),
  imageUrl: z.string().url().optional().or(z.literal("")).nullable(),
  isFree: z.boolean().optional(),
  price: z.string().optional().nullable(),
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Date invalide." },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.title !== undefined) update.title = d.title;
  if (d.description !== undefined) update.description = d.description;
  if (d.startsAt !== undefined) update.startsAt = new Date(d.startsAt);
  if (d.endsAt !== undefined) update.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if (d.locationName !== undefined) update.locationName = d.locationName;
  if (d.address !== undefined) update.address = d.address;
  if (d.category !== undefined) update.category = d.category;
  if (d.externalUrl !== undefined) update.externalUrl = d.externalUrl || null;
  if (d.imageUrl !== undefined) update.imageUrl = d.imageUrl || null;
  if (d.isFree !== undefined) update.isFree = d.isFree;
  if (d.price !== undefined) update.price = d.price;

  await db.update(events).set(update as any).where(eq(events.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const [ev] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!ev) return NextResponse.json({ error: "Evenimentul nu a fost găsit." }, { status: 404 });

  if (ev.imageUrl?.includes("/f/")) {
    const fileKey = ev.imageUrl.split("/f/")[1];
    await new UTApi().deleteFiles([fileKey]).catch(() => {});
  }

  await db.delete(events).where(eq(events.id, id));
  await db.insert(adminAuditLog).values({
    adminId: session.user!.id,
    action: "delete_event",
    entityType: "event",
    entityId: id,
    metadataJson: JSON.stringify({ title: ev.title }),
  });

  return NextResponse.json({ ok: true });
}
