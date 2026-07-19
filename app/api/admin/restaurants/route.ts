/**
 * Admin restaurant onboarding. Admin/moderator only. Creates a restaurant, assigns
 * an owner (by an EXISTING account email), and optionally mints initial tables.
 * Per-restaurant access from here on is governed by restaurant_members.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  users,
  restaurants,
  restaurantMembers,
  places,
  adminAuditLog,
} from "@/lib/db/schema";
import { uniqueRestaurantSlug } from "@/lib/restaurant-permissions";
import { addNumberedTables } from "@/lib/restaurant-tables";

const schema = z.object({
  name: z.string().min(2, "Numele trebuie să aibă cel puțin 2 caractere.").max(200),
  ownerEmail: z.string().email("Email proprietar invalid."),
  description: z.string().max(2000).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(50).optional(),
  tableCount: z.number().int().min(1).max(100).optional(), // auto-labeled Masa 1…N
  // When present, link the restaurant to an existing Localuri place instead of
  // creating a standalone one (used by the merged admin "Asociază proprietar").
  placeId: z.string().optional(),
});

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
  const { name, ownerEmail, description, address, phone, tableCount, placeId } = parsed.data;

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

  let restaurantId: string;
  let slug: string;
  let createdRestaurant = false;

  // Linking to an existing Localuri place: reuse its restaurant if one already
  // exists (just (re)assign the owner), otherwise create it under that place.
  const [existingForPlace] = placeId
    ? await db
        .select({ id: restaurants.id, slug: restaurants.slug })
        .from(restaurants)
        .where(eq(restaurants.placeId, placeId))
        .limit(1)
    : [];

  if (existingForPlace) {
    restaurantId = existingForPlace.id;
    slug = existingForPlace.slug;
  } else {
    // When linking to a place, seed missing fields from the place row.
    const [place] = placeId
      ? await db
          .select({ name: places.name, description: places.description, address: places.address, phone: places.phone })
          .from(places)
          .where(eq(places.id, placeId))
          .limit(1)
      : [];
    if (placeId && !place) {
      return NextResponse.json({ error: "Localul nu a fost găsit." }, { status: 404 });
    }

    slug = await uniqueRestaurantSlug(name || place?.name || "restaurant");
    const [created] = await db
      .insert(restaurants)
      .values({
        name: name || place?.name || "Restaurant",
        slug,
        description: description ?? place?.description ?? null,
        address: address ?? place?.address ?? null,
        phone: phone ?? place?.phone ?? null,
        placeId: placeId ?? null,
        showInLocaluri: placeId ? true : false,
        status: "active",
      })
      .returning({ id: restaurants.id });
    restaurantId = created!.id;
    createdRestaurant = true;
  }

  // Assign / ensure the owner membership (idempotent for an already-linked owner).
  const [existingMember] = await db
    .select({ id: restaurantMembers.id })
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.userId, owner.id)))
    .limit(1);
  if (!existingMember) {
    await db.insert(restaurantMembers).values({
      restaurantId,
      userId: owner.id,
      memberRole: "owner",
    });
  }

  // Optional initial tables — auto-labeled Masa 1…N, each with its own QR token.
  const tablesCreated = tableCount ? await addNumberedTables(restaurantId, tableCount) : 0;

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: createdRestaurant ? "create_restaurant" : "assign_restaurant_owner",
    entityType: "restaurant",
    entityId: restaurantId,
    metadataJson: JSON.stringify({ name, slug, ownerEmail, tables: tablesCreated, placeId: placeId ?? null }),
  });

  return NextResponse.json({ ok: true, id: restaurantId, slug }, { status: 201 });
}
