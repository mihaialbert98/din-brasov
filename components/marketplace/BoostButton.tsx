"use client";

import { useState } from "react";
import { Zap, Check, Lock } from "lucide-react";

interface Props {
  listingId: string;
  isBoosted: boolean;
  boostedUntil?: Date | null;
  paymentsEnabled: boolean;
}

export function BoostButton({ listingId, isBoosted, boostedUntil, paymentsEnabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<7 | 14>(7);

  const prices: Record<7 | 14, number> = { 7: 9, 14: 15 };

  const boostedActiveUntil = isBoosted && boostedUntil && new Date(boostedUntil) > new Date()
    ? new Date(boostedUntil)
    : null;

  async function handleBoost() {
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/listings/${listingId}/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Eroare. Încearcă din nou.");
      return;
    }

    if (data.paymentUrl) {
      window.location.href = data.paymentUrl;
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-600" aria-hidden />
        <h3 className="font-semibold text-amber-900 text-sm">Promovează anunțul</h3>
      </div>

      {boostedActiveUntil ? (
        <p className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Check className="w-4 h-4 flex-shrink-0" aria-hidden />
          Anunț promovat până pe{" "}
          {boostedActiveUntil.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      ) : !paymentsEnabled ? (
        <>
          <p className="text-xs text-amber-700">
            Anunțul tău apare în fruntea categoriei și pe pagina principală.
          </p>
          <p className="flex items-center gap-1.5 text-sm text-amber-800 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <Lock className="w-4 h-4 flex-shrink-0" aria-hidden />
            Promovarea va fi disponibilă în curând.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-amber-700">
            Anunțul tău apare în fruntea categoriei și pe pagina principală.
          </p>

          <div className="flex gap-2">
            {([7, 14] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`flex-1 text-sm py-2 px-3 rounded-lg border transition-colors ${
                  days === d
                    ? "bg-accent text-white border-accent"
                    : "bg-white text-ink/70 border-hairline hover:border-accent"
                }`}
              >
                {d} zile — {prices[d]} RON
              </button>
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <button
            type="button"
            onClick={handleBoost}
            disabled={loading}
            className="w-full bg-accent text-white font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-60 text-sm"
          >
            {loading ? "Redirecționare la plată..." : `Promovează pentru ${prices[days]} RON`}
          </button>
        </>
      )}
    </div>
  );
}
