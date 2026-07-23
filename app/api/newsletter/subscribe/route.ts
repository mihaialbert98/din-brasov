/**
 * Newsletter subscription — single opt-in. The user's un-ticked-by-default check is
 * the affirmative consent (no pre-ticking — CJEU Planet49), so the subscriber is set
 * ACTIVE immediately; no confirmation link. A one-time welcome email (with unsubscribe)
 * acknowledges it. Consent metadata (timestamp, ipHash, bannerVersion) is logged for
 * Art. 7(1), and every newsletter/campaign email carries an unsubscribe link (Art. 7(3)).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { sendNewsletterWelcomeEmail } from "@/lib/email";
import { getIp, hashIp, checkNewsletterSubscribeLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email().max(255),
  wantsNews: z.boolean(),
  wantsEvents: z.boolean(),
  wantsPlaces: z.boolean(),
  wantsExperiences: z.boolean().optional(),
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
  const wantsExperiences = parsed.data.wantsExperiences ?? false;
  const email = parsed.data.email.toLowerCase();

  if (!wantsNews && !wantsEvents && !wantsPlaces && !wantsExperiences) {
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
      // pending or unsubscribed → refresh preferences + (re)activate (single opt-in).
      await db
        .update(newsletterSubscribers)
        .set({
          wantsNews,
          wantsEvents,
          wantsPlaces,
          wantsExperiences,
          status: "active",
          verificationToken,
          verifiedAt: new Date(),
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
        wantsExperiences,
        status: "active",
        verificationToken,
        verifiedAt: new Date(),
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

  sendNewsletterWelcomeEmail(email, verificationToken).catch(() => {});

  return NextResponse.json({ ok: true });
}
