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

import { eq, and, lt, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, listings, sessions, verificationTokens } from "@/lib/db/schema";

// ─── Retention periods ────────────────────────────────────────────────────────

export const RETENTION = {
  /** Soft-delete grace period before hard deletion. 30 days matches ANSPDCP practice
   *  and gives users a window to cancel deletion requests. */
  USER_DELETION_GRACE_DAYS: 30,

  /** Expired listings: retained for 12 months post-expiry to handle disputes,
   *  then hard-deleted. Contact data (phone/email) is nulled at expiry,
   *  not just at hard deletion. */
  LISTING_POST_EXPIRY_DAYS: 365,

  /** Assisted listing consent logs: kept for life of listing + 3 years
   *  (Romanian Civil Code limitation period) to defend against complaints. */
  ASSISTED_CONSENT_LOG_YEARS: 3,

  /** Cookie consent records: 13 months (re-consent required after 12 months
   *  per EDPB guidance; 1 month buffer). */
  COOKIE_CONSENT_MONTHS: 13,
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
  await db
    .update(listings)
    .set({
      contactPhone: null,
      contactEmail: null,
      sellerId: null,
      updatedAt: new Date(),
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
