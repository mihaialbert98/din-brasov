/**
 * Resend the account-confirmation email.
 * POST { email } → if an unverified account with that email exists, regenerate
 * its token and re-send the confirmation. Always responds { ok: true } so the
 * endpoint can't be used to enumerate which emails are registered.
 * IP rate-limited to prevent email-bombing.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendAccountConfirmationEmail } from "@/lib/email";
import { getIp, hashIp } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email().max(255) });

// Simple in-memory IP throttle: max attempts per window. Resets on cold start —
// good enough as a courtesy guard alongside the always-ok response.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ipHash: string): boolean {
  const now = Date.now();
  const entry = hits.get(ipHash);
  if (!entry || now > entry.resetAt) {
    hits.set(ipHash, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  // Always behave identically regardless of validity → no enumeration signal.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const ipHash = hashIp(getIp(req));
  if (rateLimited(ipHash)) {
    return NextResponse.json(
      { error: "Prea multe încercări. Încearcă din nou mai târziu." },
      { status: 429 }
    );
  }

  const email = parsed.data.email.toLowerCase();

  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.emailVerified), isNull(users.deletedAt)))
    .limit(1);

  // Only act for a real, still-unconfirmed account; otherwise stay silent.
  if (user) {
    const token = crypto.randomUUID();
    await db
      .update(users)
      .set({ emailConfirmationToken: token, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await sendAccountConfirmationEmail(email, user.name ?? "", token).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
