"use client";

/**
 * Cookie consent banner — Law 506/2004 (Romania) + GDPR Art. 7 compliant.
 *
 * Romanian requirements:
 * - "Refuz" must be equally visible as "Accept" (2025 Law 506/2004 amendment,
 *   codifying existing ANSPDCP enforcement practice)
 * - No pre-ticked boxes, no cookie walls, no deceptive design
 * - Re-consent required every 12 months (EDPB guidance)
 * - Consent must be logged server-side (burden of proof on controller, Art. 7(1))
 * - Re-request blocked for 6 months after refusal (ANSPDCP guidance)
 *
 * ANSPDCP enforcement note: technically broken reject mechanisms are the
 * single most-fined category by ANSPDCP. The "Refuz tot" button must
 * actually prevent all non-essential cookies from loading.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { DPO_EMAIL } from "@/lib/contact";

export const CONSENT_KEY = "consent_v1";
export const CONSENT_DATE_KEY = "consent_v1_date";
export const BANNER_VERSION = "1.0";
/** Re-consent after 12 months per EDPB guidance */
const CONSENT_VALIDITY_DAYS = 365;

export type ConsentLevel = "necessary" | "analytics" | "full" | "withdrawn";

export function getStoredConsent(): ConsentLevel | null {
  if (typeof window === "undefined") return null;
  const level = localStorage.getItem(CONSENT_KEY) as ConsentLevel | null;
  const dateStr = localStorage.getItem(CONSENT_DATE_KEY);
  if (!level || !dateStr) return null;
  const age = (Date.now() - parseInt(dateStr)) / (1000 * 60 * 60 * 24);
  if (age > CONSENT_VALIDITY_DAYS) return null; // expired — show banner again
  return level;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!getStoredConsent()) setVisible(true);
  }, []);

  async function accept(level: ConsentLevel) {
    const now = Date.now();
    const expires = new Date(now + CONSENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    // Store in localStorage + cookie
    localStorage.setItem(CONSENT_KEY, level);
    localStorage.setItem(CONSENT_DATE_KEY, String(now));
    document.cookie = `${CONSENT_KEY}=${level};path=/;expires=${expires.toUTCString()};SameSite=Lax`;

    // Notify listeners (e.g. analytics) so they can react without a page reload.
    window.dispatchEvent(new CustomEvent("consent-changed", { detail: level }));

    // Log consent server-side (Art. 7(1) — burden of proof on controller)
    await fetch("/api/consent/cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentLevel: level,
        bannerVersion: BANNER_VERSION,
      }),
    }).catch(() => {}); // non-blocking — UI must not depend on this

    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Consimțământ cookie-uri"
      aria-modal="true"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] border-t-2 border-[#c84b1e] shadow-2xl p-5 md:p-6 text-white"
    >
      <div className="max-w-5xl mx-auto">
        <h2 className="font-bold text-lg mb-2">Folosim cookie-uri</h2>
        <p className="text-gray-300 text-sm mb-1">
          Folosim cookie-uri strict necesare pentru funcționarea platformei. Cu acordul tău,
          folosim și cookie-uri de analiză pentru a înțelege cum este utilizat site-ul.
        </p>
        <p className="text-gray-400 text-xs mb-3">
          Conform <strong>Legii 506/2004</strong> și <strong>GDPR</strong>, poți refuza
          cookie-urile neesențiale fără ca aceasta să îți afecteze accesul la platformă.{" "}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-[#6bb5d4] underline hover:no-underline"
          >
            {showDetails ? "Ascunde detalii" : "Detalii cookie-uri"}
          </button>
          {" · "}
          <Link href="/despre#cookies" className="text-[#6bb5d4] underline hover:no-underline">
            Politica de cookies
          </Link>
        </p>

        {showDetails && (
          <div className="bg-white/5 rounded-lg p-4 mb-4 text-sm space-y-2">
            <div>
              <p className="font-semibold text-white">Cookie-uri strict necesare</p>
              <p className="text-gray-400 text-xs">
                Sesiune de autentificare, preferințe de bază. Nu necesită consimțământ.
                Durata: sesiune / 30 zile.
              </p>
            </div>
            <div>
              <p className="font-semibold text-white">Cookie-uri de analiză <span className="text-gray-400 font-normal">(opțional)</span></p>
              <p className="text-gray-400 text-xs">
                Statistici anonime despre paginile vizitate (fără date personale identificabile).
                Durata: 12 luni. Poți retrage consimțământul oricând.
              </p>
            </div>
          </div>
        )}

        {/*
          Law 506/2004 (2025 amendment) + ANSPDCP enforcement:
          "Refuz tot" must be EQUALLY visible as "Accept tot" — same size, same prominence.
          Placing refusal in fine print or smaller buttons is an explicit violation.
        */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => accept("withdrawn")}
            className="flex-1 min-w-[120px] border border-white/40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/10 transition-colors"
            aria-label="Refuz toate cookie-urile neesențiale"
          >
            Refuz tot
          </button>
          <button
            onClick={() => accept("analytics")}
            className="flex-1 min-w-[120px] border border-[#6bb5d4] text-[#6bb5d4] px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#6bb5d4] hover:text-[#1a1a1a] transition-colors"
          >
            Accept analiză
          </button>
          <button
            onClick={() => accept("full")}
            className="flex-1 min-w-[120px] bg-[#c84b1e] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d9603a] transition-colors"
          >
            Accept tot
          </button>
        </div>

        <p className="text-gray-500 text-xs mt-3">
          Operatorul date: Din Brașov SRL · DPO: {DPO_EMAIL} ·{" "}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
            ANSPDCP
          </a>
        </p>
      </div>
    </div>
  );
}
