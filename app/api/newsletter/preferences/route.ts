/**
 * Logged-in user's newsletter preferences — view + update the sections they
 * receive (Știri / Evenimente / Localuri / Experiențe).
 *
 * Self-service granular control (GDPR Art. 7(3) — withdrawing consent must be as
 * easy as giving it). Unchecking every box unsubscribes; checking at least one
 * (re-)activates the subscription. Matches the account by userId, falling back to
 * the account email (account-based subscribers are linked by both).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { newsletterSubscribers } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

const schema = z.object({
  wantsNews: z.boolean(),
  wantsEvents: z.boolean(),
  wantsPlaces: z.boolean(),
  wantsExperiences: z.boolean(),
});

/** Find the current user's subscriber row by userId or account email. */
async function findSubscriber(userId: string, email: string | null | undefined) {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      email
        ? or(eq(newsletterSubscribers.userId, userId), eq(newsletterSubscribers.email, email))
        : eq(newsletterSubscribers.userId, userId)
    )
    .limit(1);
  return row;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const sub = await findSubscriber(userId, session.user?.email);

  return NextResponse.json({
    subscribed: !!sub && sub.status === "active",
    prefs: {
      wantsNews: sub?.wantsNews ?? false,
      wantsEvents: sub?.wantsEvents ?? false,
      wantsPlaces: sub?.wantsPlaces ?? false,
      wantsExperiences: sub?.wantsExperiences ?? false,
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const { wantsNews, wantsEvents, wantsPlaces, wantsExperiences } = parsed.data;
  const anySelected = wantsNews || wantsEvents || wantsPlaces || wantsExperiences;

  const sub = await findSubscriber(userId, email);

  // No subscriber row yet → create one (active, since the account proves the email)
  // when at least one section is chosen. Nothing to do if they unchecked everything.
  if (!sub) {
    if (!anySelected) return NextResponse.json({ subscribed: false });
    if (!email) return NextResponse.json({ error: "Cont fără email." }, { status: 400 });
    await db.insert(newsletterSubscribers).values({
      email: email.toLowerCase(),
      userId,
      wantsNews,
      wantsEvents,
      wantsPlaces,
      wantsExperiences,
      status: "active",
      verificationToken: crypto.randomUUID(), // stable unsubscribe token
      verifiedAt: new Date(),
      consentGivenAt: new Date(),
    });
    return NextResponse.json({ subscribed: true });
  }

  // Unchecking everything = unsubscribe; otherwise (re-)activate with the new mix.
  await db
    .update(newsletterSubscribers)
    .set({
      wantsNews,
      wantsEvents,
      wantsPlaces,
      wantsExperiences,
      status: anySelected ? "active" : "unsubscribed",
      unsubscribedAt: anySelected ? null : new Date(),
      // Re-consent timestamp when moving back into an active subscription.
      consentGivenAt: anySelected && sub.status !== "active" ? new Date() : sub.consentGivenAt,
      userId: sub.userId ?? userId,
    })
    .where(eq(newsletterSubscribers.id, sub.id));

  return NextResponse.json({ subscribed: anySelected });
}
