"use client";

import Link from "next/link";

type Lang = "ro" | "en";
type Variant = "footer" | "inline";

/**
 * Non-intrusive invitation for a diner to create a Din Brașov account. Styled
 * ONLY with the menu design tokens (--brand, --menu-surface, …) so it inherits
 * each restaurant's theme and reads as the venue's own, not a Din Brașov ad.
 *
 * - variant="footer": a full card at the end of the menu (primary touchpoint).
 * - variant="inline": one slim line shown for ~8s after a service request.
 *
 * The CTA links to the register page with a Google-first flow (one-tap signup),
 * carrying a callbackUrl so the diner returns to the platform afterwards.
 */

const LABELS: Record<Lang, {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  inline: string;
  inlineCta: string;
}> = {
  ro: {
    eyebrow: "Din Brașov",
    title: "Îți place să ieși în oraș?",
    body: "Evenimente, localuri noi și anunțuri din Brașov — într-un singur cont, gratuit.",
    cta: "Creează cont gratuit",
    inline: "Cât aștepți — descoperă Brașovul",
    inlineCta: "Creează cont",
  },
  en: {
    eyebrow: "Din Brașov",
    title: "Love going out in town?",
    body: "Events, new places and local listings from Brașov — in one free account.",
    cta: "Create a free account",
    inline: "While you wait — discover Brașov",
    inlineCta: "Sign up",
  },
};

// Google-first join screen; return to the homepage after signing up.
const JOIN_HREF = "/cont-nou?callbackUrl=%2F&from=menu";

export default function MenuAccountCta({
  lang = "ro",
  variant = "footer",
}: {
  lang?: Lang;
  variant?: Variant;
}) {
  const L = LABELS[lang];

  if (variant === "inline") {
    return (
      <Link
        href={JOIN_HREF}
        className="flex items-center justify-center gap-2 text-[12px] font-medium mt-2.5 py-1.5 rounded-full transition-colors"
        style={{
          color: "var(--menu-muted)",
          background: "var(--menu-paper)",
          border: "1px solid var(--menu-border)",
        }}
      >
        <span>{L.inline}</span>
        <span className="font-semibold" style={{ color: "var(--brand)" }}>
          {L.inlineCta} →
        </span>
      </Link>
    );
  }

  return (
    <div
      className="max-w-md mx-auto mt-10 p-5 text-center"
      style={{
        background: "var(--menu-surface)",
        border: "1px solid var(--menu-border)",
        borderRadius: "var(--menu-radius)",
        boxShadow: "var(--menu-shadow)",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-2"
        style={{ color: "var(--brand)" }}
      >
        {L.eyebrow}
      </p>
      <h3
        className="font-serif text-lg leading-snug mb-1.5"
        style={{ color: "var(--menu-heading, var(--menu-text))" }}
      >
        {L.title}
      </h3>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--menu-muted)" }}>
        {L.body}
      </p>
      <Link
        href={JOIN_HREF}
        className="inline-flex items-center justify-center gap-1.5 font-semibold text-[14px] tracking-wide px-5 h-[46px] transition-colors"
        style={{
          background: "var(--brand)",
          color: "var(--brand-contrast)",
          borderRadius: "var(--menu-radius-sm)",
        }}
      >
        {L.cta}
      </Link>
    </div>
  );
}
