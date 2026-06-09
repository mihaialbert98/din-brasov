/**
 * Logs cookie consent server-side.
 *
 * GDPR Art. 7(1): the controller must be able to demonstrate consent was obtained.
 * Storing consent records server-side is the only reliable way to meet this burden,
 * since client-side localStorage can be cleared by the user.
 *
 * Law 506/2004 (Romania) + ANSPDCP enforcement guidance require documented consent records.
 * Retention: 13 months (EDPB: re-consent after 12 months; 1 month buffer).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { cookieConsentLog } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

const schema = z.object({
  consentLevel: z.enum(["necessary", "analytics", "full", "withdrawn"]),
  bannerVersion: z.string().max(20),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const session = await auth();

  // Hash the IP — store a fingerprint, not PII (data minimisation, Art. 5(1)(c))
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const ipHash = createHash("sha256").update(ip + process.env.AUTH_SECRET!).digest("hex").slice(0, 16);

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 13); // 13-month retention

  await db.insert(cookieConsentLog).values({
    userId: session?.user?.id ?? null,
    consentLevel: parsed.data.consentLevel,
    bannerVersion: parsed.data.bannerVersion,
    ipHash,
    userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    expiresAt,
  });

  return NextResponse.json({ ok: true });
}
