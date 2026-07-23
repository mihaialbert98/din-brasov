import { NextResponse } from "next/server";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminAuditLog, newsletterCampaigns } from "@/lib/db/schema";
import { sendCampaign } from "@/lib/newsletter-send";

export const maxDuration = 60;

const schema = z.object({
  subject: z.string().min(3).max(150),
  heading: z.string().min(3).max(150),
  body: z.string().min(10).max(10000),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().url().optional(),
  // Mandatory: at least one category. The campaign reaches only subscribers who
  // opted into one of these (union) — never a blanket send to everyone.
  categories: z.array(z.enum(["news", "events", "places", "experiences"])).min(1).max(4),
  dryRun: z.boolean().optional(),
});

function canSend(role: string | undefined) {
  return role === "admin" || role === "moderator";
}

/** Convert a plain-text body (with line breaks) to safe HTML paragraphs. */
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

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || !canSend(role)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const d = parsed.data;
  const dryRun = d.dryRun ?? false;

  // CTA needs both label and href, or neither.
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

  const result = await sendCampaign({ content, categories: d.categories, dryRun });

  if (!dryRun) {
    const audience = d.categories.join(",");
    await db.insert(newsletterCampaigns).values({
      subject: d.subject,
      heading: d.heading,
      bodyHtml,
      imageUrl: content.imageUrl,
      ctaLabel: content.ctaLabel,
      ctaHref: content.ctaHref,
      audience,
      recipientCount: result.sent,
      sentBy: session.user.id,
    });
    await db.insert(adminAuditLog).values({
      adminId: session.user.id,
      action: "send_newsletter_campaign",
      entityType: "newsletter",
      entityId: audience,
      metadataJson: JSON.stringify({
        subject: d.subject,
        categories: d.categories,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
      }),
    });
  }

  return NextResponse.json({ ok: true, dryRun, ...result });
}
