import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, adminAuditLog } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";

const schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  startsAt: z.string().datetime({ local: true }),
  endsAt: z.string().datetime({ local: true }).optional(),
  locationName: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  isFree: z.boolean().default(true),
  price: z.string().optional(),
  currency: z.string().default("RON"),
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
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const slug = slugifyWithDate(parsed.data.title);

  try {
    await db.insert(events).values({
      title: parsed.data.title,
      description: parsed.data.description,
      slug,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      locationName: parsed.data.locationName ?? null,
      address: parsed.data.address ?? null,
      category: parsed.data.category ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      externalUrl: parsed.data.externalUrl ?? null,
      isFree: parsed.data.isFree,
      price: parsed.data.price ?? null,
      currency: parsed.data.currency,
      organizerId: session.user!.id,
      status: "published",
    });
  } catch (e: any) {
    const msg = e?.message ?? e?.cause?.message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate") || e?.cause?.code === "23505") {
      return NextResponse.json({ error: "Un eveniment cu acest titlu există deja azi. Schimbă titlul." }, { status: 409 });
    }
    console.error("Event insert error:", e);
    return NextResponse.json({ error: "Eroare la salvarea evenimentului." }, { status: 500 });
  }

  await db.insert(adminAuditLog).values({
    adminId: session.user!.id,
    action: "create_event",
    entityType: "event",
    entityId: slug,
    metadataJson: JSON.stringify({ title: parsed.data.title }),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
