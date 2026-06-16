import { Resend } from "resend";

const FROM = "Din Brașov <noreply@dinbrasov.ro>";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
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

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

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
    html: `<p>Cererea ta de ștergere a contului a fost înregistrată. Contul tău va fi șters definitiv în 30 de zile.</p><p>Dacă te-ai răzgândit, contactează-ne la contact@dinbrasov.ro.</p>`,
  });
}
