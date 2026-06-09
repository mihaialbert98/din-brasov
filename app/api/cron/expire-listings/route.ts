/**
 * Cron: expire listings + GDPR data cleanup.
 *
 * Runs daily at 02:00 (vercel.json schedule).
 *
 * Actions:
 * 1. Soft-expire active listings past their expiry date
 * 2. NULL contact data (phone/email) on newly expired listings immediately —
 *    user consent was scoped to the listing being active (GDPR Art. 5(1)(e))
 * 3. Hard-delete users past the 30-day deletion grace period (Law 190/2018 + Art. 17)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listings } from "@/lib/db/schema";
import { lt, eq, and } from "drizzle-orm";
import { hardDeleteExpiredUsers, nullContactDataOnExpiredListings } from "@/lib/gdpr";

function verifyCron(req: Request) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const now = new Date();

  // 1. Soft-expire active listings past their expiry date
  const expired = await db
    .update(listings)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(listings.status, "active"), lt(listings.expiresAt, now)))
    .returning({ id: listings.id });

  // 2. Null contact data on all expired listings (GDPR Art. 5(1)(e) storage limitation)
  await nullContactDataOnExpiredListings();

  // 3. Hard-delete users past the 30-day deletion grace period
  const deletedUsers = await hardDeleteExpiredUsers();

  return NextResponse.json({
    ok: true,
    expiredListings: expired.length,
    contactDataNulled: expired.length,
    deletedUsers,
  });
}
