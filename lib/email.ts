import { Resend } from "resend";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { formatDate, formatPrice } from "@/lib/utils";
import type { Digest } from "@/lib/newsletter-digest";

const FROM = "Din Brașov <noreply@dinbrasov.com>";
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Wraps email body content in a branded, responsive HTML layout.
 * Inline styles only (email clients strip <style>/external CSS).
 */
function emailLayout(opts: { heading: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="background:#1a1a1a;padding:24px 32px;">
          <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Din <span style="color:#c84b1e;">Brașov</span></span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1a1a1a;">${opts.heading}</h1>
          ${opts.body}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
            Din Brașov — platforma civică a brașovenilor.<br>
            Acest email a fost trimis automat. Te poți dezabona din setările contului.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:10px;background:#c84b1e;">
    <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

/** Minimal HTML escaping for values interpolated into email markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One-click unsubscribe footer line (GDPR Art. 7(3)) — appended to every bulk email. */
function unsubscribeFooter(token: string): string {
  const url = `${APP_URL}/api/newsletter/unsubscribe?token=${token}`;
  return `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#9ca3af;line-height:1.5;">
    Primești acest email pentru că te-ai abonat la newsletter-ul Din Brașov.
    <a href="${url}" style="color:#9ca3af;text-decoration:underline;">Dezabonează-te</a>.
  </p>`;
}

function sectionHeading(label: string): string {
  return `<h2 style="margin:24px 0 12px;font-size:16px;color:#1a1a1a;border-bottom:2px solid #c84b1e;padding-bottom:6px;display:inline-block;">${label}</h2>`;
}

function digestNewsBlock(d: Digest["news"]): string {
  if (d.items.length === 0) return "";
  const rows = d.items
    .map(
      (n) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <a href="${APP_URL}/stiri/${esc(n.slug)}" style="font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;line-height:1.4;">${esc(n.title)}</a>
        ${n.category ? `<span style="font-size:11px;color:#c84b1e;text-transform:uppercase;margin-left:6px;">${esc(n.category)}</span>` : ""}
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">${esc(n.excerpt)}</p>
      </td></tr>`
    )
    .join("");
  const more = d.total > d.items.length ? ` (+${d.total - d.items.length})` : "";
  return `${sectionHeading("Știri")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${ctaButton(`${APP_URL}/stiri`, `Vezi toate știrile${more} →`)}`;
}

function digestEventsBlock(d: Digest["events"]): string {
  if (d.items.length === 0) return "";
  const rows = d.items
    .map((e) => {
      const when = formatDate(e.startsAt, { day: "numeric", month: "long" });
      const priceTxt = e.isFree ? "Gratuit" : formatPrice(e.price, e.currency ?? "RON");
      const meta = [when, e.locationName, priceTxt].filter(Boolean).map((x) => esc(String(x))).join(" · ");
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <a href="${APP_URL}/evenimente/${esc(e.slug)}" style="font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;line-height:1.4;">${esc(e.title)}</a>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${meta}</p>
      </td></tr>`;
    })
    .join("");
  const more = d.total > d.items.length ? ` (+${d.total - d.items.length})` : "";
  return `${sectionHeading("Evenimente")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${ctaButton(`${APP_URL}/evenimente`, `Vezi toate evenimentele${more} →`)}`;
}

function digestPlacesBlock(d: Digest["places"]): string {
  if (d.items.length === 0) return "";
  const rows = d.items
    .map((p) => {
      const meta = [p.category, p.address].filter(Boolean).map((x) => esc(String(x))).join(" · ");
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <a href="${APP_URL}/localuri/${esc(p.slug)}" style="font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;line-height:1.4;">${esc(p.name)}</a>
        ${meta ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${meta}</p>` : ""}
      </td></tr>`;
    })
    .join("");
  const more = d.total > d.items.length ? ` (+${d.total - d.items.length})` : "";
  return `${sectionHeading("Localuri noi")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${ctaButton(`${APP_URL}/localuri`, `Vezi toate localurile${more} →`)}`;
}

export interface DigestSections {
  news: boolean;
  events: boolean;
  places: boolean;
}

/**
 * Send the weekly digest to one subscriber. `sections` is which parts THIS person
 * opted into; only opted-in, non-empty blocks are rendered.
 */
export async function sendNewsletterDigest(
  to: string,
  token: string,
  digest: Digest,
  sections: DigestSections
) {
  const body =
    (sections.news ? digestNewsBlock(digest.news) : "") +
    (sections.events ? digestEventsBlock(digest.events) : "") +
    (sections.places ? digestPlacesBlock(digest.places) : "") +
    unsubscribeFooter(token);

  const html = emailLayout({ heading: "Din Brașov săptămâna asta", body });

  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Din Brașov săptămâna asta",
    html,
  });
}

export interface CampaignContent {
  subject: string;
  heading: string;
  bodyHtml: string; // already sanitised by the caller
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
}

/** Send a one-off custom campaign (business event / new venue) to one subscriber. */
export async function sendCustomCampaign(to: string, token: string, c: CampaignContent) {
  const image = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="" style="width:100%;border-radius:12px;margin:0 0 16px;display:block;" />`
    : "";
  const cta = c.ctaLabel && c.ctaHref ? ctaButton(esc(c.ctaHref), esc(c.ctaLabel)) : "";
  const body = `${image}<div style="font-size:15px;line-height:1.6;color:#374151;">${c.bodyHtml}</div>${cta}${unsubscribeFooter(token)}`;

  const html = emailLayout({ heading: c.heading, body });

  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: c.subject,
    html,
  });
}

export async function sendAccountConfirmationEmail(
  to: string,
  name: string,
  token: string,
  opts?: { founding?: boolean }
) {
  const confirmUrl = `${APP_URL}/api/auth/confirm?token=${token}`;
  const foundingBlock = opts?.founding
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td style="background:#fdf6ec;border:1px solid #e8d9c5;border-radius:12px;padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#c84b1e;">🎉 Ești membru fondator!</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
            Faci parte din primii 1000 de membri Din Brașov. Beneficiezi de:
            <strong>4 anunțuri active gratuite</strong>, acces timpuriu la funcții noi și suport prioritar.
          </p>
        </td></tr>
      </table>`
    : "";
  const html = emailLayout({
    heading: `Salut${name ? `, ${name}` : ""}! Confirmă-ți contul`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        Mulțumim că te-ai alăturat comunității Din Brașov. Mai e un singur pas — confirmă-ți adresa de email apăsând butonul de mai jos:
      </p>
      ${ctaButton(confirmUrl, "Confirmă contul")}
      ${foundingBlock}
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
        Sau copiază acest link în browser:<br>
        <a href="${confirmUrl}" style="color:#c84b1e;word-break:break-all;">${confirmUrl}</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#9ca3af;">
        Dacă nu ți-ai creat un cont pe Din Brașov, poți ignora acest email.
      </p>`,
  });

  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Confirmă-ți contul pe Din Brașov",
    html,
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Bun venit pe Din Brașov!",
    html: `<p>Salut ${name},</p><p>Contul tău a fost creat cu succes. Bine ai venit în comunitatea Din Brașov!</p>`,
  });
}

/**
 * Welcome email for founding members who signed up via Google (they get no
 * confirmation email since OAuth pre-verifies them). Announces the VIP perks.
 */
export async function sendFoundingWelcomeEmail(to: string, name: string) {
  const html = emailLayout({
    heading: `Bun venit${name ? `, ${name}` : ""}! Ești membru fondator 🎉`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        Mulțumim că te-ai alăturat comunității Din Brașov. Faci parte din primii 1000 de membri —
        ești <strong>membru fondator</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td style="background:#fdf6ec;border:1px solid #e8d9c5;border-radius:12px;padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#c84b1e;">Beneficiile tale:</p>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">
            ✓ 4 anunțuri active gratuite<br>
            ✓ Acces timpuriu la funcții noi<br>
            ✓ Suport prioritar
          </p>
        </td></tr>
      </table>
      ${ctaButton(`${APP_URL}/anunturi/nou`, "Publică primul anunț")}`,
  });
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Bun venit pe Din Brașov — ești membru fondator!",
    html,
  });
}

export async function sendListingApprovedEmail(to: string, listingTitle: string) {
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Anunțul tău a fost aprobat",
    html: `<p>Anunțul <strong>${listingTitle}</strong> a fost aprobat și este acum vizibil pe platformă.</p>`,
  });
}

export async function sendListingRejectedEmail(to: string, listingTitle: string, reason?: string) {
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Anunțul tău nu a putut fi publicat",
    html: `<p>Anunțul <strong>${listingTitle}</strong> nu a putut fi publicat.${reason ? ` Motiv: ${reason}` : ""}</p><p>Te rugăm să revizuiești anunțul și să îl retrimiti.</p>`,
  });
}

export async function sendNewsletterVerificationEmail(to: string, token: string) {
  const verifyUrl = `${APP_URL}/api/newsletter/verify?token=${token}`;
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Confirmă abonarea la newsletter-ul Din Brașov",
    html: `<p>Salut,</p>
<p>Mulțumim că vrei să primești noutăți din Brașov! Te rugăm să confirmi abonarea apăsând butonul de mai jos:</p>
<p><a href="${verifyUrl}" style="display:inline-block;background:#c84b1e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmă abonarea</a></p>
<p style="color:#666;font-size:13px">Dacă nu te-ai abonat tu, poți ignora acest email.</p>`,
  });
}

export async function sendNewsletterWelcomeEmail(to: string, token: string) {
  const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${token}`;
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Bun venit în newsletter-ul Din Brașov!",
    html: `<p>Salut,</p>
<p>Abonarea ta a fost confirmată. De acum vei primi pe email ce contează din Brașov.</p>
<p style="color:#666;font-size:13px">Te poți dezabona oricând: <a href="${unsubscribeUrl}">dezabonează-te</a>.</p>`,
  });
}

export async function sendAccountDeletionConfirmationEmail(to: string) {
  return getResend()?.emails.send({
    from: FROM,
    to,
    subject: "Cerere de ștergere cont înregistrată",
    html: `<p>Cererea ta de ștergere a contului a fost înregistrată. Contul tău va fi șters definitiv în 30 de zile.</p><p>Dacă te-ai răzgândit, contactează-ne la ${SUPPORT_EMAIL}.</p>`,
  });
}
