/**
 * Centralized authorization helpers — single source of truth so privilege rules
 * can't drift between routes. Server-side only.
 */
import { db } from "@/lib/db";
import { users, paidSlots, listings } from "@/lib/db/schema";
import { count, isNull, eq, and, gt, inArray } from "drizzle-orm";

/**
 * Listing statuses that occupy a slot: `active` and `expired` (still in the
 * renewal grace window). `sold`/`removed`/`suspended` do not — so deleting or
 * fully expiring a listing frees a slot. Single source of truth; reused by the
 * create API, the new-listing form, and the profile.
 */
export const SLOT_STATUSES = ["active", "expired"] as const;

/**
 * Whether a role is exempt from listing/boost payments (unlimited free listings,
 * free boost). Admin + moderator ONLY. `staff` is intentionally excluded — staff
 * exists for assisted (elderly) listings, not for free perks.
 *
 * SECURITY: callers MUST pass the role read from the DB row (or the signed JWT),
 * never a value taken from the request body. No client input should reach here.
 */
export function isStaffExempt(role?: string | null): boolean {
  return role === "admin" || role === "moderator";
}

/** Total founding-member slots offered. */
export const FOUNDING_MEMBER_CAP = 1000;
/** Free-listing allowance for a founding member (vs the default of 2). */
export const FOUNDING_MEMBER_ALLOWANCE = 4;

/** Count non-deleted users (the basis for the founding-member cap). */
export async function countActiveUsers(): Promise<number> {
  const [{ c }] = await db
    .select({ c: count() })
    .from(users)
    .where(isNull(users.deletedAt));
  return c;
}

/** How many founding-member spots remain (never negative). */
export async function getFoundingSpotsLeft(): Promise<number> {
  const total = await countActiveUsers();
  return Math.max(0, FOUNDING_MEMBER_CAP - total);
}

/**
 * Single source of truth for granting founding-member status. Call AFTER the user
 * row exists (credentials register or OAuth createUser). If the user is within the
 * first FOUNDING_MEMBER_CAP non-deleted users and not already a founder, upgrades
 * them to founding member with the higher allowance.
 *
 * Returns true if it granted (so callers can decide whether to send a VIP email).
 * Server-side only — never driven by client input.
 */
export async function grantFoundingIfEligible(userId: string): Promise<boolean> {
  // The newly-created user is already counted, so being within the cap means
  // total <= CAP (the user themselves can be the CAP-th member).
  const total = await countActiveUsers();
  if (total > FOUNDING_MEMBER_CAP) return false;

  const [existing] = await db
    .select({ isFoundingMember: users.isFoundingMember })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing || existing.isFoundingMember) return existing?.isFoundingMember ? true : false;

  await db
    .update(users)
    .set({
      isFoundingMember: true,
      freeListingsAllowance: FOUNDING_MEMBER_ALLOWANCE,
      foundingMemberAt: new Date(),
    })
    .where(eq(users.id, userId));
  return true;
}

/**
 * Find a reusable paid slot for a user, if any. A slot is reusable when it's still
 * within its 30-day window, its one free replacement hasn't been used, and it's
 * currently vacant (the paid listing was deleted → currentListingId cleared).
 * Returns the slot id + its expiry (the remaining window for the replacement), or null.
 */
export async function findReusablePaidSlot(
  userId: string
): Promise<{ id: string; expiresAt: Date } | null> {
  const now = new Date();
  const [slot] = await db
    .select({ id: paidSlots.id, expiresAt: paidSlots.expiresAt })
    .from(paidSlots)
    .where(
      and(
        eq(paidSlots.userId, userId),
        eq(paidSlots.replacementUsed, false),
        isNull(paidSlots.currentListingId),
        gt(paidSlots.expiresAt, now)
      )
    )
    .limit(1);
  return slot ?? null;
}

/**
 * Count the user's CURRENT free listings (non-paid, active or expired-in-grace) —
 * the basis for the free-quota check. Paid listings sit above the free allowance
 * (tracked via paid_slots) so they're excluded here.
 */
export async function countFreeListings(userId: string): Promise<number> {
  const [{ c }] = await db
    .select({ c: count() })
    .from(listings)
    .where(
      and(
        eq(listings.sellerId, userId),
        eq(listings.isPaid, false),
        inArray(listings.status, [...SLOT_STATUSES])
      )
    );
  return c;
}

/** How many reusable (vacant, still-valid, replacement-unused) paid slots a user has. */
export async function countReusablePaidSlots(userId: string): Promise<number> {
  const now = new Date();
  const [{ c }] = await db
    .select({ c: count() })
    .from(paidSlots)
    .where(
      and(
        eq(paidSlots.userId, userId),
        eq(paidSlots.replacementUsed, false),
        isNull(paidSlots.currentListingId),
        gt(paidSlots.expiresAt, now)
      )
    );
  return c;
}
