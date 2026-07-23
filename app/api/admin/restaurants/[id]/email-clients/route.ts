/**
 * Admin: send a personalized campaign to a restaurant's clients who ALSO consented
 * (are active newsletter subscribers). Clients = account-holders AND guests who left
 * an email; recipients are matched by email so opted-in accountless guests are reached.
 * GDPR-clean — never emails non-subscribers, and every email carries the subscriber's
 * unsubscribe token. Mirrors the newsletter campaign route (sanitize, preview, archive, audit).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { and, eq, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservations, users, newsletterSubscribers, restaurants, adminAuditLog, newsletterCampaigns } from "@/lib/db/schema";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import { sendToRecipients } from "@/lib/newsletter-send";

export const maxDuration = 60;

const schema = z.object({
  subject: z.string().min(3).max(150),
  heading: z.string().min(3).max(150),
  body: z.string().min(10).max(10000),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().url().optional(),
  // When present, restrict the send to these client emails (still ∩ subscribers below).
  // Absent → target ALL of the restaurant's subscribed clients.
  emails: z.array(z.string()).max(10000).optional(),
  dryRun: z.boolean().optional(),
});

function bodyToHtml(raw: string): string {
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return sanitizeHtml(paragraphs, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "a", "ul", "ol", "li"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || !isPlatformStaff(role)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const d = parsed.data;
  const dryRun = d.dryRun ?? false;

  // Candidate emails = everyone who reserved here whom we can match to a subscriber:
  //  account-holders' account email (via userId → users.email) + guests' booking email.
  const [accountEmailRows, guestEmailRows] = await Promise.all([
    db
      .selectDistinct({ email: sql<string>`lower(${users.email})` })
      .from(reservations)
      .innerJoin(users, eq(reservations.userId, users.id))
      .where(and(eq(reservations.restaurantId, id), isNotNull(reservations.userId))),
    db
      .selectDistinct({ email: sql<string>`lower(${reservations.guestEmail})` })
      .from(reservations)
      .where(and(eq(reservations.restaurantId, id), isNull(reservations.userId), isNotNull(reservations.guestEmail))),
  ]);
  let candidateEmails = new Set<string>([...accountEmailRows, ...guestEmailRows].map((r) => r.email));

  // Admin picked a subset on the clients page → restrict to those (still ∩ subscribers
  // below, so a crafted email can't reach a non-client or non-consenting address).
  if (Array.isArray(d.emails)) {
    const sel = new Set(d.emails.map((e) => e.toLowerCase()));
    candidateEmails = new Set([...candidateEmails].filter((e) => sel.has(e)));
  }

  if (candidateEmails.size === 0) {
    return NextResponse.json({ ok: true, dryRun, sent: 0, skipped: 0, failed: 0, recipients: [] });
  }

  // Intersect with ACTIVE subscribers who opted into LOCALURI (a restaurant promo is
  // localuri content — send only what they consented to), matched by email.
  const recipientRows = await db
    .select({ email: newsletterSubscribers.email, token: newsletterSubscribers.verificationToken })
    .from(newsletterSubscribers)
    .where(and(
      eq(newsletterSubscribers.status, "active"),
      eq(newsletterSubscribers.wantsPlaces, true),
      inArray(sql`lower(${newsletterSubscribers.email})`, [...candidateEmails]),
    ));

  const recipients = recipientRows.map((r) => ({ email: r.email, token: r.token ?? "" }));

  const hasCta = Boolean(d.ctaLabel && d.ctaHref);
  const bodyHtml = bodyToHtml(d.body);
  const content = {
    subject: d.subject,
    heading: d.heading,
    bodyHtml,
    imageUrl: d.imageUrl ?? null,
    ctaLabel: hasCta ? d.ctaLabel! : null,
    ctaHref: hasCta ? d.ctaHref! : null,
  };

  const result = await sendToRecipients(recipients, content, dryRun);

  if (!dryRun) {
    const [rest] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, id)).limit(1);
    await db.insert(newsletterCampaigns).values({
      subject: d.subject,
      heading: d.heading,
      bodyHtml,
      imageUrl: content.imageUrl,
      ctaLabel: content.ctaLabel,
      ctaHref: content.ctaHref,
      audience: `restaurant:${id}`,
      recipientCount: result.sent,
      sentBy: session.user.id,
    });
    await db.insert(adminAuditLog).values({
      adminId: session.user.id,
      action: "send_restaurant_client_email",
      entityType: "restaurant",
      entityId: id,
      metadataJson: JSON.stringify({ restaurant: rest?.name, subject: d.subject, selected: d.emails?.length ?? null, sent: result.sent, skipped: result.skipped, failed: result.failed }),
    });
  }

  return NextResponse.json({ ok: true, dryRun, ...result });
}
