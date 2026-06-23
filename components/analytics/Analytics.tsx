"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getStoredConsent } from "@/components/cookie-consent/CookieBanner";

/**
 * Google Analytics 4 — loads ONLY when:
 *  1. NEXT_PUBLIC_GA_ID is set (your Measurement ID, e.g. G-XXXXXXXXXX), and
 *  2. the user has given analytics consent (level "analytics" or "full").
 *
 * GDPR / Law 506/2004 compliant: no tracking script loads before consent. Reacts
 * to the "consent-changed" event so it starts right after the user accepts,
 * without a page reload.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

function hasAnalyticsConsent(): boolean {
  const level = getStoredConsent();
  return level === "analytics" || level === "full";
}

export default function Analytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!GA_ID) return;
    if (hasAnalyticsConsent()) setEnabled(true);

    const onConsent = () => {
      if (hasAnalyticsConsent()) setEnabled(true);
    };
    window.addEventListener("consent-changed", onConsent);
    return () => window.removeEventListener("consent-changed", onConsent);
  }, []);

  if (!GA_ID || !enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
