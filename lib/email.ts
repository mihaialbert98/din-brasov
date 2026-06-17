import { Resend } from "resend";
import { SUPPORT_EMAIL } from "@/lib/contact";

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

export async function sendAccountConfirmationEmail(to: string, name: string, token: string) {
  const confirmUrl = `${APP_URL}/api/auth/confirm?token=${token}`;
  const html = emailLayout({
    heading: `Salut${name ? `, ${name}` : ""}! Confirmă-ți contul`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        Mulțumim că te-ai alăturat comunității Din Brașov. Mai e un singur pas — confirmă-ți adresa de email apăsând butonul de mai jos:
      </p>
      ${ctaButton(confirmUrl, "Confirmă contul")}
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
