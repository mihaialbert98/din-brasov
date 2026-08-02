import Link from "next/link";
import type { Lang } from "@/lib/i18n-reservation";

/**
 * RO / EN switch for the public restaurant surfaces. Plain links rather than state,
 * so the choice lives in the URL (`?lang=en`): it survives navigation from the QR
 * menu into the booking form, and a shared link keeps the language.
 *
 * `path` is the canonical page path WITHOUT a query string — the Romanian side links
 * to it bare, so RO stays the clean URL that pageMetadata() already canonicalises to.
 */
export default function LangToggle({ lang, path }: { lang: Lang; path: string }) {
  const base = "px-2.5 py-1 text-xs font-medium rounded-md transition-colors";
  return (
    <div
      className="inline-flex items-center gap-0.5 border border-hairline rounded-lg p-0.5 bg-surface flex-shrink-0"
      aria-label="Limbă / Language"
    >
      <Link
        href={path}
        hrefLang="ro"
        aria-current={lang === "ro" ? "true" : undefined}
        className={`${base} ${lang === "ro" ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
      >
        RO
      </Link>
      <Link
        href={`${path}?lang=en`}
        hrefLang="en"
        aria-current={lang === "en" ? "true" : undefined}
        className={`${base} ${lang === "en" ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
      >
        EN
      </Link>
    </div>
  );
}
