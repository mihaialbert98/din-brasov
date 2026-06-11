import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, users, payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { startNetopiaPayment } from "@/lib/netopia";

// Prices in RON per boost duration
const BOOST_PRICES: Record<number, number> = { 7: 9, 14: 15 };

const schema = z.object({
  days: z.literal(7).or(z.literal(14)).default(7),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const days = parsed.data.days;
  const amount = BOOST_PRICES[days];

  const [listing] = await db
    .select({ id: listings.id, title: listings.title, sellerId: listings.sellerId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing || listing.sellerId !== userId) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  if (listing.status !== "active") {
    return NextResponse.json({ error: "Poți promova doar anunțuri active." }, { status: 400 });
  }

  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  }

  const orderId = crypto.randomUUID();
  const baseUrl = process.env.NETOPIA_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  await db.insert(payments).values({
    userId,
    listingId: listing.id,
    netopiaOrderId: orderId,
    amount: amount * 100,
    currency: "RON",
    type: "boost",
    status: "pending",
    boostDays: days,
  });

  let paymentUrl: string;
  try {
    const result = await startNetopiaPayment({
      orderId,
      amount,
      description: `Promovare anunț ${days} zile: ${listing.title.slice(0, 60)}`,
      userEmail: user.email,
      userName: user.name ?? "Utilizator",
      returnUrl: `${baseUrl}/api/netopia/return`,
    });
    paymentUrl = result.paymentUrl;
  } catch (err) {
    await db.delete(payments).where(eq(payments.netopiaOrderId, orderId));
    console.error("Netopia boost error:", err);
    return NextResponse.json({ error: "Eroare la inițierea plății. Încearcă din nou." }, { status: 502 });
  }

  return NextResponse.json({ paymentUrl });
}
