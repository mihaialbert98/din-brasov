/**
 * Cron: expire listings + GDPR data cleanup.
 *
 * Runs daily at 02:00 (vercel.json schedule).
 *
 * Actions:
 * 1. Soft-expire active listings past their expiry date
 * 2. Hard-delete expired listings past the 30-day renewal grace period (+ Uploadthing images)
 * 3. Hard-delete users past the 30-day deletion grace period (Law 190/2018 + Art. 17)
 * 4. Delete draft news items older than 3 days
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listings, newsItems } from "@/lib/db/schema";
import { lt, eq, and, isNotNull } from "drizzle-orm";
import { hardDeleteExpiredUsers, hardDeleteExpiredListings } from "@/lib/gdpr";

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

  // 2. Hard-delete expired listings past the 30-day grace period (includes Uploadthing image cleanup)
  const deletedListings = await hardDeleteExpiredListings();

  // 3. Hard-delete users past the 30-day deletion grace period
  const deletedUsers = await hardDeleteExpiredUsers();

  // 4. Reset expired boosts
  await db
    .update(listings)
    .set({ isBoosted: false, boostedUntil: null })
    .where(and(eq(listings.isBoosted, true), isNotNull(listings.boostedUntil), lt(listings.boostedUntil, now)));

  // 5. Delete draft news items older than 3 days (not reviewed in time)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const deletedDrafts = await db
    .delete(newsItems)
    .where(and(eq(newsItems.status, "draft"), lt(newsItems.createdAt, threeDaysAgo)))
    .returning({ id: newsItems.id });

  return NextResponse.json({
    ok: true,
    expiredListings: expired.length,
    deletedListings,
    deletedUsers,
    deletedDraftNews: deletedDrafts.length,
  });
}
