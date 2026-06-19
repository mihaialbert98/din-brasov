import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, adminAuditLog } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";

const schema = z.object({
  name: z.string().min(2, "Numele trebuie să aibă cel puțin 2 caractere.").max(200),
  description: z.string().min(10, "Descrierea trebuie să aibă cel puțin 10 caractere."),
  category: z.string().optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(50).optional(),
  website: z.string().url("Website invalid. Folosește o adresă completă (https://...).").optional().or(z.literal("")),
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

  const slug = slugifyWithDate(parsed.data.name);
  const imagesJson = parsed.data.imageUrl ? JSON.stringify([parsed.data.imageUrl]) : null;

  try {
    await db.insert(places).values({
      name: parsed.data.name,
      description: parsed.data.description,
      slug,
      category: parsed.data.category ?? null,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      website: parsed.data.website || null,
      imagesJson,
      submitterId: session.user!.id,
      status: "published",
    });
  } catch (e: any) {
    const msg = e?.message ?? e?.cause?.message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate") || e?.cause?.code === "23505") {
      return NextResponse.json({ error: "Un local cu acest nume există deja. Schimbă numele." }, { status: 409 });
    }
    console.error("Place insert error:", e);
    return NextResponse.json({ error: "Eroare la salvarea localului." }, { status: 500 });
  }

  await db.insert(adminAuditLog).values({
    adminId: session.user!.id!,
    action: "create_place",
    entityType: "place",
    entityId: slug,
    metadataJson: JSON.stringify({ name: parsed.data.name }),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
