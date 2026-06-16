/**
 * Newsletter subscription — double opt-in (GDPR Art. 7 compliant).
 *
 * Anonymous subscribers are created with status "pending" and must confirm via
 * a verification email before they are "active". Consent is recorded per the
 * boxes the user actually checked (no pre-ticking — CJEU Planet49).
 * Consent metadata (timestamp, ipHash, bannerVersion) is logged for Art. 7(1).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { sendNewsletterVerificationEmail } from "@/lib/email";
import { getIp, hashIp, checkNewsletterSubscribeLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email().max(255),
  wantsNews: z.boolean(),
  wantsEvents: z.boolean(),
  wantsPlaces: z.boolean(),
  bannerVersion: z.string().max(20).optional(),
  // Honeypot — must be empty. Bots tend to fill every field.
  website: z.string().max(0).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  // Honeypot tripped → pretend success, do nothing (don't tip off the bot).
  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  const { wantsNews, wantsEvents, wantsPlaces, bannerVersion } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  if (!wantsNews && !wantsEvents && !wantsPlaces) {
    return NextResponse.json(
      { error: "Selectează cel puțin o categorie." },
      { status: 400 }
    );
  }

  const session = await auth();

  const ipHash = hashIp(getIp(req));

  // Rate limit per IP — blocks email-bombing arbitrary addresses.
  if (!(await checkNewsletterSubscribeLimit(ipHash))) {
    return NextResponse.json(
      { error: "Prea multe încercări. Încearcă din nou mai târziu." },
      { status: 429 }
    );
  }

  const verificationToken = crypto.randomUUID();

  try {
    const [existing] = await db
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    if (existing) {
      // Already active — respond identically to a fresh subscribe so the
      // endpoint can't be used to enumerate which emails are registered.
      if (existing.status === "active") {
        return NextResponse.json({ ok: true });
      }
      // pending or unsubscribed → refresh preferences + new token, reset to pending.
      await db
        .update(newsletterSubscribers)
        .set({
          wantsNews,
          wantsEvents,
          wantsPlaces,
          status: "pending",
          verificationToken,
          unsubscribedAt: null,
          consentGivenAt: new Date(),
          ipHash,
          bannerVersion: bannerVersion ?? null,
          userId: session?.user?.id ?? existing.userId ?? null,
        })
        .where(eq(newsletterSubscribers.id, existing.id));
    } else {
      await db.insert(newsletterSubscribers).values({
        email,
        userId: session?.user?.id ?? null,
        wantsNews,
        wantsEvents,
        wantsPlaces,
        status: "pending",
        verificationToken,
        ipHash,
        bannerVersion: bannerVersion ?? null,
      });
    }
  } catch (e: any) {
    // Unique race → treat as re-subscribe; surface nothing sensitive.
    if (e?.cause?.code !== "23505" && !String(e?.message).includes("unique")) {
      console.error("Newsletter subscribe error:", e);
      return NextResponse.json({ error: "Eroare la abonare." }, { status: 500 });
    }
  }

  sendNewsletterVerificationEmail(email, verificationToken).catch(() => {});

  return NextResponse.json({ ok: true });
}
