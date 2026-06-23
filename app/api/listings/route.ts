import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, users, payments, paidSlots } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";
import { startNetopiaPayment } from "@/lib/netopia";
import { PAYMENTS_ENABLED } from "@/lib/payments";
import { isStaffExempt, findReusablePaidSlot, countFreeListings } from "@/lib/permissions";
import { eq, and } from "drizzle-orm";

// Prices in RON
const LISTING_CREATION_PRICE = 9;

const schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  price: z.string().max(20).optional(),
  currency: z.string().default("RON"),
  category: z.string().min(1),
  condition: z.string().default("used"),
  location: z.string().max(200).optional(),
  contactPhone: z.string().min(6).max(20).optional(),
  images: z.array(z.string().url()).max(8).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Trebuie să fii autentificat." }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const userId = session.user.id;

  // Check free listing quota. Role + allowance are read from the DB row only —
  // never from the request — so the exemption cannot be forged by the client.
  const [user] = await db
    .select({
      freeListingsAllowance: users.freeListingsAllowance,
      role: users.role,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  }

  // Free quota = current non-paid listings (active or expired-in-grace). Paid
  // listings sit above the free allowance (tracked via paid_slots).
  const currentCount = await countFreeListings(userId);

  // Admin/moderator: unlimited free listings, never charged.
  const exempt = isStaffExempt(user.role);
  const withinFreeQuota = exempt || currentCount < user.freeListingsAllowance;

  // If over the free quota, the user may still post for free into a reusable paid
  // slot (a previously-paid 30-day window they vacated, with their one replacement
  // unused). Otherwise they must pay.
  const reusableSlot = withinFreeQuota ? null : await findReusablePaidSlot(userId);
  const needsPayment = !withinFreeQuota && !reusableSlot;

  if (needsPayment && !PAYMENTS_ENABLED) {
    return NextResponse.json(
      { error: `Ai atins limita de ${user.freeListingsAllowance} anunțuri active. Șterge un anunț sau așteaptă expirarea, ori plata va fi disponibilă în curând.` },
      { status: 403 }
    );
  }

  if (needsPayment) {
    // Store the pending listing data in a payment record and redirect to Netopia
    const orderId = crypto.randomUUID();
    const pendingData = parsed.data;

    await db.insert(payments).values({
      userId,
      netopiaOrderId: orderId,
      amount: LISTING_CREATION_PRICE * 100, // store in bani
      currency: "RON",
      type: "listing_creation",
      status: "pending",
      pendingListingJson: JSON.stringify(pendingData),
    });

    const baseUrl = process.env.NETOPIA_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    let paymentUrl: string;
    try {
      const result = await startNetopiaPayment({
        orderId,
        amount: LISTING_CREATION_PRICE,
        description: `Publicare anunț: ${parsed.data.title.slice(0, 80)}`,
        userEmail: user.email,
        userName: user.name ?? "Utilizator",
        returnUrl: `${baseUrl}/api/netopia/return`,
      });
      paymentUrl = result.paymentUrl;
    } catch (err: any) {
      // Clean up the payment record on failure
      await db.delete(payments).where(eq(payments.netopiaOrderId, orderId));
      console.error("Netopia error:", err?.message, err?.response?.data ?? err);
      return NextResponse.json({
        error: "Eroare la inițierea plății. Încearcă din nou.",
        detail: err?.message ?? String(err),
      }, { status: 502 });
    }

    return NextResponse.json({ needsPayment: true, paymentUrl }, { status: 202 });
  }

  // Create the listing. If it's filling a reusable paid slot, it inherits the
  // slot's remaining window and is marked paid; otherwise it's a normal free
  // listing with a fresh 30-day window.
  const slug = slugifyWithDate(parsed.data.title);
  const expiresAt = reusableSlot
    ? reusableSlot.expiresAt
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [listing] = await db
    .insert(listings)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      slug,
      price: parsed.data.price || null,
      currency: parsed.data.currency,
      category: parsed.data.category,
      condition: parsed.data.condition,
      location: parsed.data.location || null,
      contactPhone: parsed.data.contactPhone || null,
      imagesJson: parsed.data.images?.length ? JSON.stringify(parsed.data.images) : null,
      sellerId: userId,
      status: "active",
      expiresAt,
      isPaid: !!reusableSlot,
      paidSlotId: reusableSlot?.id ?? null,
    })
    .returning({ id: listings.id, slug: listings.slug });

  // If we used a reusable slot, consume its one allowed replacement and re-occupy it.
  // Conditional update (replacementUsed=false) makes the claim atomic — if two
  // requests race for the same slot, only the first claims it; the loser's listing
  // simply remains a normal paid listing in the slot without double-spending it.
  if (reusableSlot) {
    await db
      .update(paidSlots)
      .set({ currentListingId: listing.id, replacementUsed: true })
      .where(and(eq(paidSlots.id, reusableSlot.id), eq(paidSlots.replacementUsed, false)));
  }

  // No counter to bump — the free quota is computed live from current listings.

  return NextResponse.json({ ok: true, slug: listing.slug }, { status: 201 });
}
