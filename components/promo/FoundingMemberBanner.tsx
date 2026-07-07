import Link from "next/link";
import { Star, Check, ArrowRight } from "lucide-react";

/**
 * Founding-member promo. Presentational — the caller computes `spotsLeft`
 * server-side via getFoundingSpotsLeft() and only renders when spots remain.
 *
 * `variant="banner"` — full homepage section.
 * `variant="compact"` — small callout for the register page.
 */
export default function FoundingMemberBanner({
  spotsLeft,
  variant = "banner",
}: {
  spotsLeft: number;
  variant?: "banner" | "compact";
}) {
  if (spotsLeft <= 0) return null;

  const perks = [
    "4 anunțuri active gratuite",
    "Acces timpuriu la funcții noi",
    "Suport prioritar",
  ];

  if (variant === "compact") {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 mb-6">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-accent-hover">
          <Star className="w-4 h-4 flex-shrink-0" aria-hidden />
          Primii 1000 de membri sunt membri fondatori
        </p>
        <p className="text-sm text-ink/70 mt-1">
          {perks.join(" · ")}. Au mai rămas{" "}
          <strong className="tabular-nums">{spotsLeft} {spotsLeft === 1 ? "loc" : "locuri"}</strong>.
        </p>
      </div>
    );
  }

  return (
    <section className="bg-accent-soft border-y border-accent/15" aria-label="Ofertă membri fondatori">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent bg-white rounded-full px-3 py-1 mb-2">
            <Star className="w-3.5 h-3.5" aria-hidden />
            <span className="tabular-nums">Doar {spotsLeft} {spotsLeft === 1 ? "loc rămas" : "locuri rămase"}</span>
          </p>
          <h2 className="text-2xl font-semibold font-serif text-ink">
            Primii 1000 de membri = Membri fondatori
          </h2>
          <ul className="mt-2 text-ink/70 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 flex-shrink-0 text-accent" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/cont-nou"
          className="group flex-shrink-0 inline-flex items-center gap-2 bg-accent text-white font-semibold px-6 py-3 rounded-lg hover:bg-accent-hover transition-colors"
        >
          Creează cont gratuit
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
