import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";

/**
 * Link an anonymous newsletter subscription to a newly-created/confirmed account
 * by matching the subscriber's email to the account's (verified) email. Called on
 * signup/confirm so a subscription made via the banner (no account) shows up in the
 * user's profile newsletter settings and is manageable there. Case-insensitive;
 * only touches an unlinked row (userId IS NULL); keeps the chosen preferences.
 * Best-effort — never blocks sign-up.
 */
export async function linkAnonNewsletter(userId: string, email: string): Promise<void> {
  await db
    .update(newsletterSubscribers)
    .set({ userId })
    .where(
      and(
        sql`lower(${newsletterSubscribers.email}) = ${email.toLowerCase()}`,
        isNull(newsletterSubscribers.userId),
      ),
    );
}
