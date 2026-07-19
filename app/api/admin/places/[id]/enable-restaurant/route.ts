/**
 * Lazily create the restaurant capability layer for an existing Localuri place.
 * Admin/moderator only. If the place already has a linked restaurant, this is a
 * no-op that returns its slug. Otherwise it creates a `restaurants` row seeded
 * from the place fields, linked via placeId, and surfaced in Localuri.
 *
 * Used by the merged admin "Localuri" list — a directory-only local gains menu +
 * reservation capabilities; the admin then finishes setup on /restaurant/[slug].
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, restaurants, adminAuditLog } from "@/lib/db/schema";
import { uniqueRestaurantSlug } from "@/lib/restaurant-permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id: placeId } = await params;

  const [place] = await db
    .select({ name: places.name, description: places.description, address: places.address, phone: places.phone })
    .from(places)
    .where(eq(places.id, placeId))
    .limit(1);
  if (!place) {
    return NextResponse.json({ error: "Localul nu a fost găsit." }, { status: 404 });
  }

  // Already linked → no-op, return the existing slug.
  const [existing] = await db
    .select({ slug: restaurants.slug })
    .from(restaurants)
    .where(eq(restaurants.placeId, placeId))
    .limit(1);
  if (existing) {
    return NextResponse.json({ ok: true, slug: existing.slug, created: false });
  }

  const slug = await uniqueRestaurantSlug(place.name);
  const [created] = await db
    .insert(restaurants)
    .values({
      name: place.name,
      slug,
      description: place.description ?? null,
      address: place.address ?? null,
      phone: place.phone ?? null,
      placeId,
      showInLocaluri: true,
      status: "active",
    })
    .returning({ id: restaurants.id });

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "enable_restaurant",
    entityType: "restaurant",
    entityId: created!.id,
    metadataJson: JSON.stringify({ placeId, slug }),
  });

  return NextResponse.json({ ok: true, slug, created: true }, { status: 201 });
}
