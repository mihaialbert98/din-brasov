import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "admin" || role === "moderator";

  const [listing] = await db
    .select({ id: listings.id, sellerId: listings.sellerId, status: listings.status, imagesJson: listings.imagesJson })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  const isOwner = listing.sellerId === session.user.id;

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }

  // Owner can only delete their own expired listings (during grace period)
  if (isOwner && !isAdmin && listing.status !== "expired") {
    return NextResponse.json({ error: "Poți șterge doar anunțurile expirate." }, { status: 400 });
  }

  // Delete Uploadthing images
  try {
    const images = JSON.parse(listing.imagesJson ?? "[]") as string[];
    const keys = images.map((u) => u.split("/f/")[1]).filter(Boolean);
    if (keys.length) await new UTApi().deleteFiles(keys);
  } catch {
    // non-critical
  }

  await db.delete(listings).where(eq(listings.id, id));

  return NextResponse.json({ ok: true });
}
