// Netopia Payments helper — wraps netopia-card for Next.js App Router
// Requires env: NETOPIA_API_KEY, NETOPIA_SIGNATURE, NEXTAUTH_URL, NETOPIA_SANDBOX

import { Netopia } from "netopia-card";

const isSandbox = process.env.NETOPIA_SANDBOX === "true" || process.env.NODE_ENV !== "production";
// NETOPIA_BASE_URL overrides for local dev with ngrok tunnel
const baseUrl = process.env.NETOPIA_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export type NetopiaPaymentType = "listing_creation" | "boost";

interface StartPaymentOptions {
  orderId: string;
  amount: number; // RON, e.g. 9.99
  description: string;
  userEmail: string;
  userName: string; // "Prenume Nume"
  userPhone?: string;
  /** returnUrl will have ?orderId=... appended */
  returnUrl?: string;
}

export async function startNetopiaPayment(opts: StartPaymentOptions): Promise<{ paymentUrl: string }> {
  const [firstName, ...rest] = (opts.userName || "Utilizator Anonim").split(" ");
  const lastName = rest.join(" ") || "—";

  const notifyUrl = `${baseUrl}/api/netopia/ipn`;
  const returnUrl = opts.returnUrl ?? `${baseUrl}/api/netopia/return`;

  const netopia = new Netopia({
    apiKey: process.env.NETOPIA_API_KEY!,
    posSignature: process.env.NETOPIA_SIGNATURE!,
    notifyUrl,
    redirectUrl: returnUrl,
    sandbox: isSandbox,
  });

  netopia.setOrderData({
    orderID: opts.orderId,
    amount: opts.amount,
    currency: "RON",
    description: opts.description,
    dateTime: new Date().toISOString(),
    billing: {
      email: opts.userEmail,
      firstName,
      lastName,
      phone: opts.userPhone ?? "0000000000",
      city: "Brașov",
      country: 642, // Romania
    },
  });

  netopia.setProductsData([
    {
      name: opts.description,
      code: opts.orderId,
      category: "Serviciu digital",
      price: opts.amount,
      vat: 0,
    },
  ]);

  const response = await (netopia as any).startPayment();

  const paymentUrl =
    response?.payment?.paymentURL ??
    response?.paymentURL ??
    null;

  if (!paymentUrl) {
    throw new Error("Netopia nu a returnat un URL de plată.");
  }

  return { paymentUrl };
}
