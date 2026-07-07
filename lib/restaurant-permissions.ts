/**
 * Per-restaurant authorization helpers — single source of truth for restaurant
 * membership checks. Restaurants are multi-tenant: access is granted by a row in
 * `restaurant_members` (memberRole: owner | waiter), NOT by a global user role.
 *
 * SECURITY: every restaurant API route and page MUST resolve the restaurant
 * server-side and gate on these helpers. Platform admins/moderators are granted
 * implicit oversight access (they onboard and supervise restaurants).
 * Never trust a restaurantId/role taken from the request body alone.
 */
import { db } from "@/lib/db";
import { restaurants, restaurantMembers, restaurantEditUnlocks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { RestaurantMember } from "@/lib/db/schema";

export type MemberRole = "owner" | "waiter";

/** True for platform-level oversight (admins onboard + supervise restaurants). */
export function isPlatformStaff(role?: string | null): boolean {
  return role === "admin" || role === "moderator";
}

/** The caller's membership row for a restaurant, or null if they're not a member. */
export async function getMembership(
  userId: string,
  restaurantId: string
): Promise<RestaurantMember | null> {
  const [row] = await db
    .select()
    .from(restaurantMembers)
    .where(
      and(
        eq(restaurantMembers.restaurantId, restaurantId),
        eq(restaurantMembers.userId, userId)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Whether the user may MANAGE the restaurant (menu, tables, staff). Owners and
 * platform staff. Pass the platform `role` from the session/JWT so admins pass
 * even without a membership row.
 */
export async function canManageRestaurant(
  userId: string,
  restaurantId: string,
  platformRole?: string | null
): Promise<boolean> {
  if (isPlatformStaff(platformRole)) return true;
  const m = await getMembership(userId, restaurantId);
  return m?.memberRole === "owner";
}

/**
 * Whether the user may access the SERVICE board (see/ack table requests). Owners,
 * waiters, and platform staff.
 */
export async function canServeRestaurant(
  userId: string,
  restaurantId: string,
  platformRole?: string | null
): Promise<boolean> {
  if (isPlatformStaff(platformRole)) return true;
  const m = await getMembership(userId, restaurantId);
  return m?.memberRole === "owner" || m?.memberRole === "waiter";
}

/**
 * Whether menu MUTATIONS are currently allowed. Platform staff (admin) always.
 * Owners must hold an active email-code unlock window (2FA on the shared screen).
 * Caller must already have passed canManageRestaurant.
 */
export async function canEditMenuNow(
  userId: string,
  restaurantId: string,
  platformRole?: string | null
): Promise<boolean> {
  if (isPlatformStaff(platformRole)) return true;
  const [row] = await db
    .select({ unlockedUntil: restaurantEditUnlocks.unlockedUntil })
    .from(restaurantEditUnlocks)
    .where(
      and(
        eq(restaurantEditUnlocks.restaurantId, restaurantId),
        eq(restaurantEditUnlocks.userId, userId)
      )
    )
    .limit(1);
  return !!row?.unlockedUntil && row.unlockedUntil.getTime() > Date.now();
}

/** All restaurants the user belongs to, with their membership role. */
export async function getUserRestaurants(userId: string) {
  return db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      status: restaurants.status,
      memberRole: restaurantMembers.memberRole,
    })
    .from(restaurantMembers)
    .innerJoin(restaurants, eq(restaurantMembers.restaurantId, restaurants.id))
    .where(eq(restaurantMembers.userId, userId));
}

/**
 * Full gate for a menu MUTATION request: must be the session owner/admin AND
 * (for owners) hold an active edit-unlock window. Returns the userId on success,
 * or an { error, status } to return directly. `locked` distinguishes "needs the
 * 2FA code" (423) from "not your restaurant" (403) so the UI can prompt for a code.
 */
export async function authorizeMenuEdit(
  session: { user?: { id?: string } } | null,
  platformRole: string | null | undefined,
  restaurantId: string
): Promise<{ userId: string } | { error: string; status: 401 | 403 | 423 }> {
  const userId = session?.user?.id;
  if (!userId) return { error: "Neautorizat", status: 401 };
  if (!(await canManageRestaurant(userId, restaurantId, platformRole))) {
    return { error: "Neautorizat", status: 403 };
  }
  if (!(await canEditMenuNow(userId, restaurantId, platformRole))) {
    return { error: "Editarea meniului este blocată. Deblochează cu codul trimis pe email.", status: 423 };
  }
  return { userId };
}

/** Resolve a restaurant by slug (used by the owner/waiter area pages). */
export async function getRestaurantBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.slug, slug))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a restaurant by its shared staff-board token. The unguessable token is
 * the credential (no login) — same trust model as the diner's per-table menu
 * token. Returns null for an unknown or suspended restaurant.
 */
export async function getRestaurantByStaffToken(token: string) {
  const [row] = await db
    .select({ id: restaurants.id, name: restaurants.name, status: restaurants.status })
    .from(restaurants)
    .where(eq(restaurants.staffToken, token))
    .limit(1);
  if (!row || row.status !== "active") return null;
  return row;
}
