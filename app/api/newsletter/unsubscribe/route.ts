/**
 * Newsletter unsubscribe — one-click via the token embedded in every email.
 * GDPR Art. 7(3): withdrawal must be as easy as giving consent.
 * GET /api/newsletter/unsubscribe?token=...
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${APP_URL}/?newsletter=eroare`);
  }

  const [sub] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.verificationToken, token))
    .limit(1);

  if (!sub) {
    return NextResponse.redirect(`${APP_URL}/?newsletter=eroare`);
  }

  await db
    .update(newsletterSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.id, sub.id));

  return NextResponse.redirect(`${APP_URL}/?newsletter=dezabonat`);
}
