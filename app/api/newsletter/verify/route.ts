/**
 * Newsletter verification — completes double opt-in.
 * GET /api/newsletter/verify?token=... → marks subscriber active, sends welcome.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import { sendNewsletterWelcomeEmail } from "@/lib/email";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${APP_URL}/?newsletter=eroare`);
  }

  const [sub] = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.verificationToken, token),
        eq(newsletterSubscribers.status, "pending")
      )
    )
    .limit(1);

  if (!sub) {
    return NextResponse.redirect(`${APP_URL}/?newsletter=eroare`);
  }

  await db
    .update(newsletterSubscribers)
    .set({ status: "active", verifiedAt: new Date() })
    .where(eq(newsletterSubscribers.id, sub.id));

  sendNewsletterWelcomeEmail(sub.email, token).catch(() => {});

  return NextResponse.redirect(`${APP_URL}/?newsletter=confirmat`);
}
