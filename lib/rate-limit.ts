import { createHash } from "crypto";
import { db } from "@/lib/db";
import { phoneReveals, messages, newsletterSubscribers } from "@/lib/db/schema";
import { eq, and, gt, count } from "drizzle-orm";

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip + process.env.AUTH_SECRET!)
    .digest("hex")
    .slice(0, 16);
}

export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Max 20 phone reveals per user per hour */
export async function checkPhoneRevealLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ c: count() })
    .from(phoneReveals)
    .where(and(eq(phoneReveals.userId, userId), gt(phoneReveals.createdAt, since)));
  return (row?.c ?? 0) < 20;
}

/** Max 30 messages per day for all users; 5/day for accounts < 7 days old */
export async function checkMessageLimit(
  userId: string,
  accountCreatedAt: Date
): Promise<{ allowed: boolean; reason?: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const accountAgeDays =
    (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Count all messages sent by this user in the last 24h, regardless of buyer/seller role
  const [row] = await db
    .select({ c: count() })
    .from(messages)
    .where(and(eq(messages.senderId, userId), gt(messages.createdAt, since)));

  const totalSent = row?.c ?? 0;
  const dailyLimit = accountAgeDays < 7 ? 5 : 30;

  if (totalSent >= dailyLimit) {
    return {
      allowed: false,
      reason:
        accountAgeDays < 7
          ? "Conturile noi pot trimite maxim 5 mesaje pe zi."
          : "Ai atins limita zilnică de 30 de mesaje.",
    };
  }
  return { allowed: true };
}

/**
 * Max 5 newsletter subscribe attempts per IP per hour.
 * Prevents email-bombing arbitrary addresses via the verification email.
 */
export async function checkNewsletterSubscribeLimit(ipHash: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ c: count() })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.ipHash, ipHash), gt(newsletterSubscribers.consentGivenAt, since)));
  return (row?.c ?? 0) < 5;
}

/** URL detection — scam messages almost always contain links */
export function detectUrls(text: string): boolean {
  return /(https?:\/\/|t\.me\/|wa\.me\/|bit\.ly|tinyurl|goo\.gl)/i.test(text);
}
