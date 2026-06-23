import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, paidSlots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

const patchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  price: z.string().max(20).nullable().optional(),
  category: z.string().min(1).optional(),
  condition: z.string().optional(),
  location: z.string().max(200).nullable().optional(),
  contactPhone: z.string().min(6).max(20).nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [listing] = await db
    .select({
      id: listings.id,
      title: listings.title,
      description: listings.description,
      slug: listings.slug,
      price: listings.price,
      currency: listings.currency,
      category: listings.category,
      condition: listings.condition,
      location: listings.location,
      contactPhone: listings.contactPhone,
      status: listings.status,
      sellerId: listings.sellerId,
    })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "admin" || role === "moderator";

  if (listing.sellerId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }

  return NextResponse.json(listing);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [listing] = await db
    .select({ id: listings.id, sellerId: listings.sellerId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "admin" || role === "moderator";

  if (listing.sellerId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }

  if (!isAdmin && listing.status !== "active") {
    return NextResponse.json({ error: "Poți edita doar anunțurile active." }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  await db
    .update(listings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(listings.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [listing] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      status: listings.status,
      imagesJson: listings.imagesJson,
      isPaid: listings.isPaid,
      paidSlotId: listings.paidSlotId,
    })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "admin" || role === "moderator";
  const isOwner = listing.sellerId === session.user.id;

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }

  // Owner can delete their own active or expired listings
  if (isOwner && !isAdmin && listing.status !== "active" && listing.status !== "expired") {
    return NextResponse.json({ error: "Nu poți șterge acest anunț." }, { status: 400 });
  }

  try {
    const images = JSON.parse(listing.imagesJson ?? "[]") as string[];
    const keys = images.map((u) => u.split("/f/")[1]).filter(Boolean);
    if (keys.length) await new UTApi().deleteFiles(keys);
  } catch {
    // non-critical
  }

  // Vacate the paid slot (if any) so the user can post one replacement into it for
  // the remaining days. The slot's replacementUsed flag still limits it to one refill.
  if (listing.isPaid && listing.paidSlotId) {
    await db
      .update(paidSlots)
      .set({ currentListingId: null })
      .where(eq(paidSlots.id, listing.paidSlotId));
  }

  await db.delete(listings).where(eq(listings.id, id));

  return NextResponse.json({ ok: true });
}
