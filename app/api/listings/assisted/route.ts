/**
 * Creates an assisted marketplace listing on behalf of an elderly caller.
 *
 * GDPR compliance:
 * - Verbal consent is valid (GDPR Recital 32), but must be documented (Art. 7(1))
 * - Consent log written to assisted_consent_log table immediately
 * - Staff must confirm consent was obtained via staffConsentTicked checkbox
 * - Caller's phone stored in consent log for traceability
 * - Listing expires in 30 days; contact data nulled at expiry (Law 190/2018 + Art. 5(1)(e))
 *
 * Joint controller note (CJEU C-492/23 Russmedia):
 * Platform and the caller are joint controllers. The platform bears responsibility
 * for ensuring the lawfulness of the listing — hence the mandatory consent log.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, assistedConsentLog } from "@/lib/db/schema";
import { slugifyWithDate } from "@/lib/slugify";

/** Version of the verbal consent script currently in use. Update when script changes. */
const CONSENT_SCRIPT_VERSION = "v1.0";

const PURPOSES_EXPLAINED = [
  "publish_listing",
  "display_contact_phone",
  "platform_storage_30_days",
  "right_to_withdraw_explained",
];

const schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  price: z.string().optional(),
  currency: z.string().default("RON"),
  category: z.string().min(1),
  condition: z.string().default("used"),
  location: z.string().optional(),
  contactPhone: z.string().min(6).max(20),
  callerName: z.string().max(100).optional(),
  withdrawalInformed: z.boolean(),
  staffConsentTicked: z.boolean(),
});

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;

  if (!session || (role !== "admin" && role !== "staff")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  if (!parsed.data.staffConsentTicked) {
    return NextResponse.json(
      { error: "Consimțământul verbal al apelantului este obligatoriu (GDPR Art. 7)." },
      { status: 400 }
    );
  }

  if (!parsed.data.withdrawalInformed) {
    return NextResponse.json(
      { error: "Apelantul trebuie informat despre dreptul de retragere a consimțământului." },
      { status: 400 }
    );
  }

  const slug = slugifyWithDate(parsed.data.title);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // Create listing
  const [listing] = await db
    .insert(listings)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      slug,
      price: parsed.data.price,
      currency: parsed.data.currency,
      category: parsed.data.category,
      condition: parsed.data.condition,
      location: parsed.data.location,
      contactPhone: parsed.data.contactPhone,
      status: "active",
      isAssisted: true,
      staffOperatorId: session.user!.id!,
      staffConsentTicked: true,
      expiresAt,
    })
    .returning({ id: listings.id });

  // Write consent log immediately — required to document verbal consent (Art. 7(1))
  await db.insert(assistedConsentLog).values({
    listingId: listing.id,
    staffOperatorId: session.user!.id!,
    callerPhone: parsed.data.contactPhone,
    callerName: parsed.data.callerName ?? null,
    consentScriptVersion: CONSENT_SCRIPT_VERSION,
    purposesExplainedJson: JSON.stringify(PURPOSES_EXPLAINED),
    withdrawalInformed: parsed.data.withdrawalInformed,
  });

  return NextResponse.json({ ok: true, listingId: listing.id }, { status: 201 });
}
