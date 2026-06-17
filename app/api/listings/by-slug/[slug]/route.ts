import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { slug } = await params;

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
    .where(eq(listings.slug, slug))
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
