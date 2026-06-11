// Netopia redirects users here after the payment page (success or failure).
// We look up the order status and redirect to the right page.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payments, listings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId") ?? searchParams.get("order_id") ?? searchParams.get("orderID");

  const base = process.env.NETOPIA_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  if (!orderId) {
    return NextResponse.redirect(`${base}/anunturi?payment=failed`);
  }

  const [paymentRow] = await db
    .select()
    .from(payments)
    .where(eq(payments.netopiaOrderId, orderId))
    .limit(1);

  if (!paymentRow) {
    return NextResponse.redirect(`${base}/anunturi?payment=failed`);
  }

  // If boost: redirect to the listing
  if (paymentRow.type === "boost" && paymentRow.listingId) {
    const [listing] = await db
      .select({ slug: listings.slug })
      .from(listings)
      .where(eq(listings.id, paymentRow.listingId))
      .limit(1);

    const slug = listing?.slug;
    if (paymentRow.status === "confirmed" && slug) {
      return NextResponse.redirect(`${base}/anunturi/${slug}?payment=success`);
    }
    return NextResponse.redirect(`${base}/profil?payment=failed`);
  }

  // listing_creation: IPN may arrive before or after the return redirect
  // Redirect to profile with a flag — the profile page will show a banner
  if (paymentRow.status === "confirmed" && paymentRow.listingId) {
    const [listing] = await db
      .select({ slug: listings.slug })
      .from(listings)
      .where(eq(listings.id, paymentRow.listingId))
      .limit(1);

    if (listing?.slug) {
      return NextResponse.redirect(`${base}/anunturi/${listing.slug}?payment=success`);
    }
  }

  // IPN hasn't fired yet or payment failed — go to profile with pending banner
  const outcome = paymentRow.status === "confirmed" ? "success" : "pending";
  return NextResponse.redirect(`${base}/profil?payment=${outcome}`);
}
