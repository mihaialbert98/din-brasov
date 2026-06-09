import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { RETENTION } from "@/lib/gdpr";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [listing] = await db
    .select({ id: listings.id, sellerId: listings.sellerId, status: listings.status, expiresAt: listings.expiresAt })
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.status, "expired")))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit sau nu este expirat." }, { status: 404 });
  }

  if (listing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }

  // Check still within grace period
  const graceCutoff = new Date(Date.now() - RETENTION.LISTING_POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  if (listing.expiresAt && listing.expiresAt < graceCutoff) {
    return NextResponse.json({ error: "Perioada de reînnoire a expirat." }, { status: 400 });
  }

  const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  await db
    .update(listings)
    .set({ status: "active", expiresAt: newExpiresAt, updatedAt: now })
    .where(eq(listings.id, id));

  return NextResponse.json({ ok: true });
}
