/**
 * Owner opt-in to surface a restaurant in the Localuri directory + expose a public
 * read-only menu. Owner (via the menu-edit 2FA unlock) or platform admin.
 *
 * On ENABLE: if the restaurant has no linked place yet, create a DRAFT place from
 * the restaurant's data (name/description/address/phone/image, category=Restaurant)
 * and link it via restaurants.placeId. The place stays `draft` until an admin
 * publishes it — nothing goes public without review. If a linked place exists but
 * was rejected/unpublished, re-submit it as `draft`.
 *
 * On DISABLE: flip the flag off and set the linked place back to `draft` so it
 * drops out of Localuri (kept, not deleted, so re-enabling is instant).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, places, restaurantMembers } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";
import { slugifyWithDate } from "@/lib/slugify";

const schema = z.object({ show: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  const gate = await authorizeMenuEdit(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { show } = parsed.data;

  const [restaurant] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      description: restaurants.description,
      address: restaurants.address,
      phone: restaurants.phone,
      logoUrl: restaurants.logoUrl,
      coverUrl: restaurants.coverUrl,
      placeId: restaurants.placeId,
    })
    .from(restaurants)
    .where(eq(restaurants.id, id))
    .limit(1);
  if (!restaurant) return NextResponse.json({ error: "Restaurant negăsit." }, { status: 404 });

  const now = new Date();

  if (show) {
    if (restaurant.placeId) {
      // Re-submit an existing (possibly rejected/unpublished) place for review.
      await db
        .update(places)
        .set({ status: "draft", updatedAt: now })
        .where(eq(places.id, restaurant.placeId));
      await db.update(restaurants).set({ showInLocaluri: true, updatedAt: now }).where(eq(restaurants.id, id));
    } else {
      // Create a fresh draft place from the restaurant's data.
      const [owner] = await db
        .select({ userId: restaurantMembers.userId })
        .from(restaurantMembers)
        .where(eq(restaurantMembers.restaurantId, id))
        .limit(1);

      const image = restaurant.coverUrl ?? restaurant.logoUrl;
      const placeId = crypto.randomUUID();
      await db.insert(places).values({
        id: placeId,
        name: restaurant.name,
        // places.description is NOT NULL — fall back to a neutral line.
        description: restaurant.description ?? `${restaurant.name} — local din Brașov.`,
        slug: slugifyWithDate(restaurant.name),
        category: "Restaurant",
        address: restaurant.address ?? null,
        phone: restaurant.phone ?? null,
        imagesJson: image ? JSON.stringify([image]) : null,
        submitterId: owner?.userId ?? null,
        status: "draft",
      });
      await db
        .update(restaurants)
        .set({ showInLocaluri: true, placeId, updatedAt: now })
        .where(eq(restaurants.id, id));
    }
  } else {
    // Disable: hide the flag and take the linked place out of Localuri.
    await db.update(restaurants).set({ showInLocaluri: false, updatedAt: now }).where(eq(restaurants.id, id));
    if (restaurant.placeId) {
      await db
        .update(places)
        .set({ status: "draft", updatedAt: now })
        .where(eq(places.id, restaurant.placeId));
    }
  }

  return NextResponse.json({ ok: true, show });
}
