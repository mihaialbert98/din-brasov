"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Check, Clock } from "lucide-react";

/**
 * Owner opt-in to show the restaurant in the public Localuri directory and expose
 * a read-only public menu. Enabling creates a draft place that an admin reviews
 * before it goes live; the state line reflects where the place is in that flow.
 */
export default function LocaluriToggle({
  restaurantId,
  initialEnabled,
  placePublished,
}: {
  restaurantId: string;
  initialEnabled: boolean;
  placePublished: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show: next }),
    });
    setLoading(false);
    if (res.ok) {
      setEnabled(next);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Eroare. Încearcă din nou.");
    }
  }

  return (
    <section className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-[#c84b1e]/10 flex items-center justify-center flex-shrink-0">
          <Store className="w-5 h-5 text-[#c84b1e]" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900">Afișează în Localuri</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Localul tău apare în secțiunea Localuri de pe Din Brașov, iar clienții pot vedea meniul
            public înainte să vină. Meniul public nu are butoanele de comandă.
          </p>

          {enabled && (
            <p className="text-xs mt-2 flex items-center gap-1.5">
              {placePublished ? (
                <span className="inline-flex items-center gap-1.5 text-green-700">
                  <Check className="w-3.5 h-3.5" aria-hidden /> Publicat în Localuri
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-600">
                  <Clock className="w-3.5 h-3.5" aria-hidden /> În așteptarea aprobării de către echipa Din Brașov
                </span>
              )}
            </p>
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <button
            onClick={toggle}
            disabled={loading}
            className={`mt-3 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 ${
              enabled
                ? "border border-gray-300 text-gray-600 hover:bg-gray-50"
                : "bg-[#c84b1e] text-white hover:bg-[#d9603a]"
            }`}
          >
            {loading ? "Se salvează..." : enabled ? "Retrage din Localuri" : "Afișează în Localuri"}
          </button>
        </div>
      </div>
    </section>
  );
}
