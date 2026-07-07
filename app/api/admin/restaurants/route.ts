/**
 * Admin restaurant onboarding. Admin/moderator only. Creates a restaurant, assigns
 * an owner (by an EXISTING account email), and optionally mints initial tables.
 * Per-restaurant access from here on is governed by restaurant_members.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  users,
  restaurants,
  restaurantMembers,
  adminAuditLog,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slugify";
import { addNumberedTables } from "@/lib/restaurant-tables";

const schema = z.object({
  name: z.string().min(2, "Numele trebuie să aibă cel puțin 2 caractere.").max(200),
  ownerEmail: z.string().email("Email proprietar invalid."),
  description: z.string().max(2000).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(50).optional(),
  tableCount: z.number().int().min(1).max(100).optional(), // auto-labeled Masa 1…N
});

/** Build a unique slug from the name (no date suffix — it's a brand URL). */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "restaurant";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const [existing] = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
      .limit(1);
    if (!existing) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Date invalide." },
      { status: 400 }
    );
  }
  const { name, ownerEmail, description, address, phone, tableCount } = parsed.data;

  // Owner must already have an account (v1 — no invite flow).
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail.toLowerCase()))
    .limit(1);
  if (!owner) {
    return NextResponse.json(
      { error: "Nu există un cont cu acest email. Proprietarul trebuie să își creeze cont întâi." },
      { status: 404 }
    );
  }

  const slug = await uniqueSlug(name);

  const [created] = await db
    .insert(restaurants)
    .values({
      name,
      slug,
      description: description ?? null,
      address: address ?? null,
      phone: phone ?? null,
      status: "active",
    })
    .returning({ id: restaurants.id });

  const restaurantId = created!.id;

  await db.insert(restaurantMembers).values({
    restaurantId,
    userId: owner.id,
    memberRole: "owner",
  });

  // Optional initial tables — auto-labeled Masa 1…N, each with its own QR token.
  const tablesCreated = tableCount ? await addNumberedTables(restaurantId, tableCount) : 0;

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "create_restaurant",
    entityType: "restaurant",
    entityId: restaurantId,
    metadataJson: JSON.stringify({ name, slug, ownerEmail, tables: tablesCreated }),
  });

  return NextResponse.json({ ok: true, id: restaurantId, slug }, { status: 201 });
}
