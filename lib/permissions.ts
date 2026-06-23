/**
 * Centralized authorization helpers — single source of truth so privilege rules
 * can't drift between routes. Server-side only.
 */
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { count, isNull } from "drizzle-orm";

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
