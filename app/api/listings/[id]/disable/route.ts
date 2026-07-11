import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Owner turns off their own active listing. It becomes `disabled`: hidden from
 * the public, still visible to the owner + admins, and reactivatable by the owner.
 * The disabledAt stamp starts the 30-day auto-delete clock.
 */
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
    .select({ sellerId: listings.sellerId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }
  if (listing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }
  if (listing.status !== "active") {
    return NextResponse.json({ error: "Doar anunțurile active pot fi dezactivate." }, { status: 400 });
  }

  const now = new Date();
  await db
    .update(listings)
    .set({ status: "disabled", disabledAt: now, updatedAt: now })
    .where(eq(listings.id, id));

  return NextResponse.json({ ok: true });
}
