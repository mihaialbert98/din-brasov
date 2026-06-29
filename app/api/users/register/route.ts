import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, newsletterSubscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendAccountConfirmationEmail } from "@/lib/email";
import { grantFoundingIfEligible } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  wantsNews: z.boolean().optional(),
  wantsEvents: z.boolean().optional(),
  wantsPlaces: z.boolean().optional(),
  wantsExperiences: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Date invalide. Verifică câmpurile completate." },
      { status: 400 }
    );
  }

  const { name, password, wantsNews, wantsEvents, wantsPlaces, wantsExperiences } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Există deja un cont cu acest email." },
      { status: 409 }
    );
  }

  const hash = await bcrypt.hash(password, 12);
  const confirmationToken = crypto.randomUUID();
  const [newUser] = await db.insert(users).values({
    name,
    email,
    password: hash,
    role: "user",
    gdprConsentAt: new Date(),
    emailVerified: null, // confirmed via the email link before first login
    emailConfirmationToken: confirmationToken,
  }).returning({ id: users.id });

  // Founding-member promotion — single source of truth, shared with Google signups
  // (lib/auth.ts createUser event). Decided server-side; never from client input.
  const founding = newUser?.id ? await grantFoundingIfEligible(newUser.id) : false;

  // Newsletter prefs chosen at sign-up are pre-verified (email proven via account).
  if (wantsNews || wantsEvents || wantsPlaces || wantsExperiences) {
    await db.insert(newsletterSubscribers).values({
      email,
      userId: newUser?.id ?? null,
      wantsNews: !!wantsNews,
      wantsEvents: !!wantsEvents,
      wantsPlaces: !!wantsPlaces,
      wantsExperiences: !!wantsExperiences,
      status: "active",
      verificationToken: crypto.randomUUID(), // stable unsubscribe token
      verifiedAt: new Date(),
      consentGivenAt: new Date(),
    }).catch(() => {}); // don't fail registration if newsletter insert fails
  }

  // Send the confirmation email. The user must click the link before they can log in.
  await sendAccountConfirmationEmail(email, name, confirmationToken, { founding }).catch(() => {});

  return NextResponse.json({ ok: true, needsConfirmation: true }, { status: 201 });
}
