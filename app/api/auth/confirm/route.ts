/**
 * Account email confirmation.
 * GET /api/auth/confirm?token=... → marks the account verified, consumes the
 * token, then redirects to the login page with a success/error flag.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { linkAnonReservations } from "@/lib/reservations";
import { linkAnonNewsletter } from "@/lib/newsletter";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${APP_URL}/intra?confirmare=invalid`);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.emailConfirmationToken, token))
    .limit(1);

  if (!user) {
    // Token not found — either already used (and cleared) or invalid.
    return NextResponse.redirect(`${APP_URL}/intra?confirmare=invalid`);
  }

  // Idempotent: if somehow already verified, still send them to the happy path.
  await db
    .update(users)
    .set({ emailVerified: user.emailVerified ?? new Date(), emailConfirmationToken: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Link anything they created anonymously with this (now-verified) email:
  // reservations + any newsletter subscription made via the banner.
  await linkAnonReservations(user.id, user.email).catch(() => {});
  await linkAnonNewsletter(user.id, user.email).catch(() => {});

  return NextResponse.redirect(`${APP_URL}/intra?confirmat=1`);
}
