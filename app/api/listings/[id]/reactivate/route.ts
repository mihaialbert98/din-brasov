import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, users } from "@/lib/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";
import { isStaffExempt, SLOT_STATUSES } from "@/lib/permissions";

/**
 * Owner reactivates their own disabled listing. It returns to `active` with a
 * fresh 30-day window, and disabledAt is cleared.
 *
 * Guards:
 *  - must be the owner (sellerId match) — an account-deletion orphan has a null
 *    sellerId, so nobody can reactivate it (it stays disabled → auto-deleted).
 *  - must currently be `disabled`.
 *  - free-quota re-check: a free listing may only reactivate if the owner is
 *    within their allowance (excluding this listing, which is already counted).
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
    .select({ sellerId: listings.sellerId, status: listings.status, isPaid: listings.isPaid })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }
  if (!listing.sellerId || listing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 403 });
  }
  if (listing.status !== "disabled") {
    return NextResponse.json({ error: "Doar anunțurile dezactivate pot fi reactivate." }, { status: 400 });
  }

  // Free-quota re-check (paid listings and staff/admin are exempt). Count the
  // user's OTHER slot-occupying free listings; block if that already meets the
  // allowance (this listing itself is excluded so it can always come back if
  // there's room). This matters only if the allowance was lowered.
  if (!listing.isPaid) {
    const [user] = await db
      .select({ freeListingsAllowance: users.freeListingsAllowance, role: users.role })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (user && !isStaffExempt(user.role)) {
      const [{ c }] = await db
        .select({ c: count() })
        .from(listings)
        .where(
          and(
            eq(listings.sellerId, session.user.id),
            eq(listings.isPaid, false),
            inArray(listings.status, [...SLOT_STATUSES]),
          )
        );
      // `c` includes this disabled listing; the others are c - 1.
      if (c - 1 >= user.freeListingsAllowance) {
        return NextResponse.json(
          { error: `Ai atins limita de ${user.freeListingsAllowance} anunțuri active. Șterge un anunț înainte de a reactiva acesta.` },
          { status: 403 }
        );
      }
    }
  }

  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db
    .update(listings)
    .set({ status: "active", expiresAt: newExpiresAt, disabledAt: null, updatedAt: now })
    .where(eq(listings.id, id));

  return NextResponse.json({ ok: true });
}
