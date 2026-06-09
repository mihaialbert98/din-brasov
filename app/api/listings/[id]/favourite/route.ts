import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, listingFavourites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ saved: false }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select({ userId: listingFavourites.userId })
    .from(listingFavourites)
    .where(and(eq(listingFavourites.listingId, id), eq(listingFavourites.userId, session.user.id)))
    .limit(1);

  return NextResponse.json({ saved: !!row });
}

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
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.status, "active")))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  const [existing] = await db
    .select({ userId: listingFavourites.userId })
    .from(listingFavourites)
    .where(and(eq(listingFavourites.listingId, id), eq(listingFavourites.userId, session.user.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Deja salvat." }, { status: 409 });
  }

  await db.insert(listingFavourites).values({ userId: session.user.id, listingId: id });

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

  await db
    .delete(listingFavourites)
    .where(and(eq(listingFavourites.listingId, id), eq(listingFavourites.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
