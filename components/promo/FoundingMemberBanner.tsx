import Link from "next/link";

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
      <div className="rounded-xl border border-[#e8d9c5] bg-[#fdf6ec] px-4 py-3 mb-6">
        <p className="text-sm font-semibold text-[#c84b1e]">
          ★ Primii 1000 de membri sunt membri fondatori
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {perks.join(" · ")}. Au mai rămas{" "}
          <strong>{spotsLeft} {spotsLeft === 1 ? "loc" : "locuri"}</strong>.
        </p>
      </div>
    );
  }

  return (
    <section className="bg-[#fdf6ec] border-y border-[#e8d9c5]" aria-label="Ofertă membri fondatori">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <p className="inline-block text-xs font-bold uppercase tracking-wide text-[#c84b1e] bg-white rounded-full px-3 py-1 mb-2">
            ★ Doar {spotsLeft} {spotsLeft === 1 ? "loc rămas" : "locuri rămase"}
          </p>
          <h2 className="text-2xl font-bold font-serif text-[#1a1a1a]">
            Primii 1000 de membri = Membri fondatori
          </h2>
          <ul className="mt-2 text-gray-600 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <span className="text-[#c84b1e]">✓</span> {p}
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/cont-nou"
          className="flex-shrink-0 bg-[#c84b1e] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#d9603a] transition-colors"
        >
          Creează cont gratuit →
        </Link>
      </div>
    </section>
  );
}
