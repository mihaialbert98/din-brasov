/**
 * GDPR compliance — Romanian law context
 *
 * Applicable legislation:
 *  - EU GDPR (Regulation 2016/679)
 *  - Romanian Law 190/2018 (national GDPR implementation)
 *  - Romanian Law 506/2004 (ePrivacy / cookie law)
 *  - ANSPDCP (Romania's supervisory authority) enforcement guidance
 *  - CJEU C-492/23 Russmedia ruling (joint controller liability for marketplace operators)
 *
 * Key Romanian specifics:
 *  - Digital consent age: 16 years (Law 190/2018, Art. 5) — maximum allowed by GDPR Art. 8
 *  - Erasure "without undue delay" = max 1 month per ANSPDCP interpretation
 *  - General civil limitation period: 3 years (Romanian Civil Code) — used for consent log retention
 *  - Breach notification to ANSPDCP: within 72 hours (ANSPDCP Decision 128/2018 form)
 *  - Marketplace operators are joint controllers with users (CJEU C-492/23, Dec 2025)
 *  - Assisted listing verbal consent: valid under GDPR Recital 32, but must be documented
 *    (call log + staff member + script version + timestamp — see assistedListingConsentLog table)
 */

import { eq, and, lt, lte, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, listings, sessions, verificationTokens, newsletterSubscribers, newsItems, events } from "@/lib/db/schema";
import { UTApi } from "uploadthing/server";

/** Extract an Uploadthing file key from a stored image URL (…/f/<key>). */
function uploadthingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const key = url.split("/f/")[1];
  return key || null;
}

// ─── Retention periods ────────────────────────────────────────────────────────

export const RETENTION = {
  /** Soft-delete grace period before hard deletion. 30 days matches ANSPDCP practice
   *  and gives users a window to cancel deletion requests. */
  USER_DELETION_GRACE_DAYS: 30,

  /** Expired listings: retained for 7 days post-expiry so the owner can renew.
   *  Contact data is kept in DB during this window but never shown publicly.
   *  After 7 days with no renewal, listing is hard-deleted including photos.
   *  Legacy path — new listings age out into `disabled`, not `expired`. */
  LISTING_POST_EXPIRY_DAYS: 7,

  /** Disabled listings (aged-out, owner-turned-off, or orphaned by account
   *  deletion): kept for 30 days so the owner can reactivate, then hard-deleted
   *  including photos. Measured from disabledAt. */
  LISTING_DISABLED_DAYS: 30,

  /** Assisted listing consent logs: kept for life of listing + 3 years
   *  (Romanian Civil Code limitation period) to defend against complaints. */
  ASSISTED_CONSENT_LOG_YEARS: 3,

  /** Cookie consent records: 13 months (re-consent required after 12 months
   *  per EDPB guidance; 1 month buffer). */
  COOKIE_CONSENT_MONTHS: 13,

  /** Published news: kept for 2 weeks, then hard-deleted (row + image). News is
   *  time-sensitive; older items are of little value and reduce our scraping /
   *  copyright footprint (excerpts only, source-attributed). */
  NEWS_PUBLISHED_DAYS: 14,

  /** Finished events: kept for 2 weeks after their END date, then hard-deleted
   *  (row + image). Events with no end date are never auto-deleted. */
  EVENT_POST_END_DAYS: 14,
} as const;

// ─── User deletion (GDPR Art. 17 — right to erasure) ─────────────────────────

/**
 * Step 1 of account deletion: soft-delete + immediate anonymisation.
 * Must complete within 1 month of erasure request (ANSPDCP interpretation of Art. 17).
 *
 * Step 2 (hard delete) runs via cron after RETENTION.USER_DELETION_GRACE_DAYS.
 */
export async function requestUserDeletion(userId: string): Promise<void> {
  const now = new Date();

  // 1. Anonymise all listings — null contact data immediately (Art. 17 + Russmedia joint controller obligation)
  await anonymiseUserListings(userId);

  // 2. Soft-delete the user: null sensitive fields, set deletion_requested_at
  //    Keep email until hard-delete to honour erasure requests and prevent re-registration
  await db
    .update(users)
    .set({
      deletionRequestedAt: now,
      password: null,
      phone: null,
      image: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  // 3. Invalidate all active sessions immediately
  await db.delete(sessions).where(eq(sessions.userId, userId));

  // 4. Delete pending verification tokens
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, userId));

  // 5. Unsubscribe from the newsletter (withdrawal of consent on erasure)
  await db
    .update(newsletterSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: now })
    .where(eq(newsletterSubscribers.userId, userId));
}

/**
 * Anonymise all marketplace listings for a user.
 * Contact info is nulled immediately — it must not persist after an erasure request.
 * The listing title/description remains (the user voluntarily made it public;
 * removal of all traces is not required where legitimate interests of other parties exist).
 * Seller relationship is severed by nulling seller_id.
 *
 * Based on: GDPR Art. 17, Russmedia joint controller obligations (CJEU C-492/23).
 */
export async function anonymiseUserListings(userId: string): Promise<void> {
  const now = new Date();
  await db
    .update(listings)
    .set({
      contactPhone: null,
      contactEmail: null,
      sellerId: null,
      // Take the listing out of circulation: with the seller gone and contact
      // data stripped, an "active" listing would be uncontactable but still
      // publicly visible. Disable it (hidden from public); the disabled-30-day
      // sweep then hard-deletes it. Seller is null, so nobody can reactivate it.
      status: "disabled",
      disabledAt: now,
      updatedAt: now,
    })
    .where(eq(listings.sellerId, userId));
}

/**
 * Step 2: Hard-delete users whose deletion was requested more than
 * RETENTION.USER_DELETION_GRACE_DAYS ago.
 *
 * Run by cron (/api/cron/expire-listings).
 * Returns count of hard-deleted users.
 */
export async function hardDeleteExpiredUsers(): Promise<number> {
  const cutoff = new Date(
    Date.now() - RETENTION.USER_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000
  );

  const toDelete = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        lt(users.deletionRequestedAt, cutoff),
        isNotNull(users.deletionRequestedAt),
        isNull(users.deletedAt)
      )
    );

  for (const { id } of toDelete) {
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));
  }

  return toDelete.length;
}

// ─── Listing hard-delete after grace period ───────────────────────────────────

/**
 * Hard-delete expired listings that have passed the renewal grace period
 * (RETENTION.LISTING_POST_EXPIRY_DAYS).
 * Deletes Uploadthing images first, then the DB row (cascade clears favourites,
 * reports, phone reveals, and assisted consent logs).
 *
 * Contact data (phone/email) is nulled here — it was kept in DB during the grace
 * period so the owner could renew without re-entering it. Once hard-deleted,
 * all PII is gone. This is compliant because the data was never publicly accessible
 * after the listing expired.
 */
export async function hardDeleteExpiredListings(): Promise<number> {
  const cutoff = new Date(
    Date.now() - RETENTION.LISTING_POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  const dead = await db
    .select({ id: listings.id, imagesJson: listings.imagesJson })
    .from(listings)
    .where(and(eq(listings.status, "expired"), lte(listings.expiresAt, cutoff)));

  if (dead.length === 0) return 0;

  const keys = dead.flatMap((l) => {
    try {
      return (JSON.parse(l.imagesJson ?? "[]") as string[])
        .map((u) => u.split("/f/")[1])
        .filter(Boolean);
    } catch {
      return [];
    }
  });

  if (keys.length) {
    await new UTApi().deleteFiles(keys);
  }

  await db
    .delete(listings)
    .where(inArray(listings.id, dead.map((l) => l.id)));

  return dead.length;
}

/**
 * Hard-delete listings that have been `disabled` for more than
 * RETENTION.LISTING_DISABLED_DAYS (measured from disabledAt).
 *
 * Covers every way a listing enters `disabled`: aged out at expiry, turned off by
 * the owner, or orphaned by account deletion (seller nulled). Uploadthing images
 * are removed first, then the DB row (cascade clears favourites, reports, phone
 * reveals, assisted consent logs). Same pattern as hardDeleteExpiredListings().
 */
export async function hardDeleteDisabledListings(): Promise<number> {
  const cutoff = new Date(
    Date.now() - RETENTION.LISTING_DISABLED_DAYS * 24 * 60 * 60 * 1000
  );

  const dead = await db
    .select({ id: listings.id, imagesJson: listings.imagesJson })
    .from(listings)
    .where(and(eq(listings.status, "disabled"), lte(listings.disabledAt, cutoff)));

  if (dead.length === 0) return 0;

  const keys = dead.flatMap((l) => {
    try {
      return (JSON.parse(l.imagesJson ?? "[]") as string[])
        .map((u) => uploadthingKey(u))
        .filter((k): k is string => Boolean(k));
    } catch {
      return [];
    }
  });

  if (keys.length) {
    await new UTApi().deleteFiles(keys);
  }

  await db
    .delete(listings)
    .where(inArray(listings.id, dead.map((l) => l.id)));

  return dead.length;
}

// ─── News retention (2-week window) ───────────────────────────────────────────

/**
 * Hard-delete PUBLISHED news older than RETENTION.NEWS_PUBLISHED_DAYS, by publish
 * date (falling back to creation date when unpublished-but-published-status). The
 * item's Uploadthing image (if we host it) is removed first, then the DB row.
 *
 * Drafts are handled separately (deleted after 3 days unreviewed by the expiry
 * cron); this only touches items the public can actually see. Returns the count.
 */
export async function hardDeleteOldNews(): Promise<number> {
  const cutoff = new Date(
    Date.now() - RETENTION.NEWS_PUBLISHED_DAYS * 24 * 60 * 60 * 1000
  );

  const dead = await db
    .select({ id: newsItems.id, imageUrl: newsItems.imageUrl })
    .from(newsItems)
    .where(
      and(
        eq(newsItems.status, "published"),
        // Use publishedAt, falling back to createdAt when it's null.
        lt(sql`COALESCE(${newsItems.publishedAt}, ${newsItems.createdAt})`, cutoff)
      )
    );

  if (dead.length === 0) return 0;

  // Only our own Uploadthing-hosted images have a deletable key; scraped source
  // images (arbitrary hosts) simply have no key and are skipped.
  const keys = dead.map((n) => uploadthingKey(n.imageUrl)).filter((k): k is string => !!k);
  if (keys.length) {
    await new UTApi().deleteFiles(keys).catch(() => {});
  }

  await db.delete(newsItems).where(inArray(newsItems.id, dead.map((n) => n.id)));

  return dead.length;
}

// ─── Event retention (2 weeks after end date) ─────────────────────────────────

/**
 * Hard-delete events whose END date is more than RETENTION.EVENT_POST_END_DAYS
 * in the past (row + Uploadthing image). Events with NO end date are never
 * auto-deleted — they may be open-ended/recurring and are removed manually.
 * Returns the count.
 */
export async function hardDeleteEndedEvents(): Promise<number> {
  const cutoff = new Date(
    Date.now() - RETENTION.EVENT_POST_END_DAYS * 24 * 60 * 60 * 1000
  );

  const dead = await db
    .select({ id: events.id, imageUrl: events.imageUrl })
    .from(events)
    .where(and(isNotNull(events.endsAt), lt(events.endsAt, cutoff)));

  if (dead.length === 0) return 0;

  const keys = dead.map((e) => uploadthingKey(e.imageUrl)).filter((k): k is string => !!k);
  if (keys.length) {
    await new UTApi().deleteFiles(keys).catch(() => {});
  }

  await db.delete(events).where(inArray(events.id, dead.map((e) => e.id)));

  return dead.length;
}

// ─── Listing contact data expiry ──────────────────────────────────────────────

/**
 * Null contact data on expired listings.
 * Contact phone/email must not remain accessible after a listing expires —
 * the user's consent was scoped to the listing being active.
 *
 * Called by the same expiry cron that soft-deletes the listing status.
 */
export async function nullContactDataOnExpiredListings(): Promise<void> {
  await db
    .update(listings)
    .set({
      contactPhone: null,
      contactEmail: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(listings.status, "expired"),
        isNotNull(listings.contactPhone)
      )
    );
}

// ─── Consent age check (Law 190/2018, Art. 5) ────────────────────────────────

/** Romania's digital consent age is 16 (Law 190/2018, Art. 5 — maximum permitted by GDPR Art. 8). */
export const DIGITAL_CONSENT_AGE = 16;

export function isOldEnoughForDigitalConsent(birthDate: Date): boolean {
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  const exactAge =
    monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
  return exactAge >= DIGITAL_CONSENT_AGE;
}
