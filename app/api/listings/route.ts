import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";

const schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  price: z.string().max(20).optional(),
  currency: z.string().default("RON"),
  category: z.string().min(1),
  condition: z.string().default("used"),
  location: z.string().max(200).optional(),
  contactPhone: z.string().min(6).max(20).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Trebuie să fii autentificat." }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const slug = slugifyWithDate(parsed.data.title);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [listing] = await db
    .insert(listings)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      slug,
      price: parsed.data.price || null,
      currency: parsed.data.currency,
      category: parsed.data.category,
      condition: parsed.data.condition,
      location: parsed.data.location || null,
      contactPhone: parsed.data.contactPhone || null,
      contactEmail: parsed.data.contactEmail || null,
      sellerId: session.user.id,
      status: "active",
      expiresAt,
    })
    .returning({ id: listings.id, slug: listings.slug });

  return NextResponse.json({ ok: true, slug: listing.slug }, { status: 201 });
}
