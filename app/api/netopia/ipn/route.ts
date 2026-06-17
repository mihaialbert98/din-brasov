// Netopia IPN (Instant Payment Notification) handler
// Netopia POSTs raw JSON text here after a payment completes.
// Must respond with { errorCode: 0 } on success.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { payments, listings, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { slugifyWithDate } from "@/lib/slugify";

// Expected prices (in minor units — RON * 100) per product. A confirmed IPN must
// match the price for its type, so a forged/replayed confirm can't grant a
// mismatched or unpaid product.
const BOOST_PRICES_MINOR: Record<number, number> = { 7: 900, 14: 1500 };
const LISTING_CREATION_MINOR = 900;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  // IPN authenticity: the notify URL we registered with Netopia carries a secret.
  // Reject any callback that doesn't present it (blocks forged IPNs).
  const ipnSecret = process.env.NETOPIA_IPN_SECRET ?? process.env.CRON_SECRET ?? "";
  const presentedKey = new URL(req.url).searchParams.get("key") ?? "";
  if (!ipnSecret || !safeEqual(presentedKey, ipnSecret)) {
    return NextResponse.json({ errorCode: 1 }, { status: 401 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ errorCode: 1 }, { status: 400 });
  }

  let order: any, payment: any;
  try {
    const parsed = JSON.parse(body);
    order = parsed.order;
    payment = parsed.payment;
  } catch {
    return NextResponse.json({ errorCode: 1 }, { status: 400 });
  }

  if (!order?.orderID || !payment) {
    return NextResponse.json({ errorCode: 1 }, { status: 400 });
  }

  const orderId = order.orderID;
  const status = payment.status;

  console.log("Netopia IPN received:", JSON.stringify({ orderId, status, payment, order }, null, 2));

  // Netopia v2 uses numeric status codes: 3 = confirmed, 5 = confirmed_pending
  // Also handle string variants for safety
  const isConfirmed =
    status === 3 || status === 5 ||
    status === "3" || status === "5" ||
    status === "confirmed" || status === "confirmed_pending" || status === "paid_pending";

  const [paymentRow] = await db
    .select()
    .from(payments)
    .where(eq(payments.netopiaOrderId, orderId))
    .limit(1);

  if (!paymentRow) {
    // Unknown order — still return 0 to avoid Netopia retries
    return NextResponse.json({ errorCode: 0 });
  }

  if (paymentRow.status === "confirmed") {
    // Already processed (Netopia can send duplicate IPN)
    return NextResponse.json({ errorCode: 0 });
  }

  if (!isConfirmed) {
    await db
      .update(payments)
      .set({ status: "failed" })
      .where(eq(payments.netopiaOrderId, orderId));
    return NextResponse.json({ errorCode: 0 });
  }

  // Validate the stored amount matches the expected price for this product type.
  // (paymentRow.amount is what WE computed server-side at checkout, in minor units.)
  const expectedMinor =
    paymentRow.type === "boost"
      ? BOOST_PRICES_MINOR[paymentRow.boostDays ?? 7]
      : LISTING_CREATION_MINOR;

  if (!expectedMinor || paymentRow.amount !== expectedMinor) {
    console.error("IPN amount mismatch:", { orderId, got: paymentRow.amount, expected: expectedMinor });
    await db
      .update(payments)
      .set({ status: "failed" })
      .where(eq(payments.netopiaOrderId, orderId));
    return NextResponse.json({ errorCode: 0 });
  }

  // Mark payment confirmed
  await db
    .update(payments)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(payments.netopiaOrderId, orderId));

  if (paymentRow.type === "listing_creation" && paymentRow.pendingListingJson) {
    try {
      const data = JSON.parse(paymentRow.pendingListingJson);
      const slug = slugifyWithDate(data.title);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const [listing] = await db
        .insert(listings)
        .values({
          title: data.title,
          description: data.description,
          slug,
          price: data.price || null,
          currency: data.currency ?? "RON",
          category: data.category,
          condition: data.condition ?? "used",
          location: data.location || null,
          contactPhone: data.contactPhone || null,
          imagesJson: Array.isArray(data.images) && data.images.length ? JSON.stringify(data.images) : null,
          sellerId: paymentRow.userId,
          status: "active",
          expiresAt,
        })
        .returning({ id: listings.id, slug: listings.slug });

      // Link the listing to the payment and increment user counter
      await db
        .update(payments)
        .set({ listingId: listing.id })
        .where(eq(payments.netopiaOrderId, orderId));

      // Get current count then increment
      const [u] = await db
        .select({ freeListingsUsed: users.freeListingsUsed })
        .from(users)
        .where(eq(users.id, paymentRow.userId))
        .limit(1);

      await db
        .update(users)
        .set({ freeListingsUsed: (u?.freeListingsUsed ?? 0) + 1 })
        .where(eq(users.id, paymentRow.userId));
    } catch (err) {
      console.error("IPN listing creation error:", err);
      return NextResponse.json({ errorCode: 1 }, { status: 500 });
    }
  } else if (paymentRow.type === "boost" && paymentRow.listingId) {
    const days = paymentRow.boostDays ?? 7;
    const boostedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await db
      .update(listings)
      .set({ isBoosted: true, boostedUntil })
      .where(eq(listings.id, paymentRow.listingId));
  }

  return NextResponse.json({ errorCode: 0 });
}
