import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, newsletterSubscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendWelcomeEmail } from "@/lib/email";
import { slugify } from "@/lib/slugify";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  wantsNews: z.boolean().optional(),
  wantsEvents: z.boolean().optional(),
  wantsPlaces: z.boolean().optional(),
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

  const { name, password, wantsNews, wantsEvents, wantsPlaces } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Există deja un cont cu acest email." },
      { status: 409 }
    );
  }

  const hash = await bcrypt.hash(password, 12);
  const [newUser] = await db.insert(users).values({
    name,
    email,
    password: hash,
    role: "user",
    gdprConsentAt: new Date(),
  }).returning({ id: users.id });

  // Newsletter prefs chosen at sign-up are pre-verified (email proven via account).
  if (wantsNews || wantsEvents || wantsPlaces) {
    await db.insert(newsletterSubscribers).values({
      email,
      userId: newUser?.id ?? null,
      wantsNews: !!wantsNews,
      wantsEvents: !!wantsEvents,
      wantsPlaces: !!wantsPlaces,
      status: "active",
      verificationToken: crypto.randomUUID(), // stable unsubscribe token
      verifiedAt: new Date(),
      consentGivenAt: new Date(),
    }).catch(() => {}); // don't fail registration if newsletter insert fails
  }

  await sendWelcomeEmail(email, name).catch(() => {});

  return NextResponse.json({ ok: true }, { status: 201 });
}
