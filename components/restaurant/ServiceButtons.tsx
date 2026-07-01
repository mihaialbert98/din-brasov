"use client";

import { useState } from "react";

type RequestType = "call_waiter" | "request_check";
type PaymentMethod = "cash" | "card";

export default function ServiceButtons({
  token,
  disabled = false,
}: {
  token: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<RequestType | null>(null);
  const [sent, setSent] = useState<RequestType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // When true, the check button expands into a Numerar / Card choice.
  const [choosingPay, setChoosingPay] = useState(false);

  async function send(type: RequestType, paymentMethod?: PaymentMethod) {
    setPending(type);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, paymentMethod }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Eroare. Încearcă din nou.");
        return;
      }
      setSent(type);
      setChoosingPay(false);
      // Let the diner send again after a short while (e.g. nobody came).
      setTimeout(() => setSent((s) => (s === type ? null : s)), 8000);
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setPending(null);
    }
  }

  if (disabled) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 text-center">
        <p className="max-w-md mx-auto text-sm text-gray-500">
          Masa este momentan indisponibilă.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="max-w-md mx-auto">
        {choosingPay ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 flex-shrink-0">Plătești cu:</span>
            <button
              onClick={() => send("request_check", "cash")}
              disabled={pending !== null}
              className="flex-1 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              Numerar
            </button>
            <button
              onClick={() => send("request_check", "card")}
              disabled={pending !== null}
              className="flex-1 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              Card
            </button>
            <button
              onClick={() => setChoosingPay(false)}
              className="text-sm text-gray-400 hover:text-gray-600 flex-shrink-0"
              aria-label="Anulează"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => send("call_waiter")}
              disabled={pending !== null}
              className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-xl hover:bg-[#d9603a] transition-colors disabled:opacity-60"
            >
              {sent === "call_waiter" ? "✓ Vine imediat" : pending === "call_waiter" ? "..." : "Cheamă ospătarul"}
            </button>
            <button
              onClick={() => { setChoosingPay(true); setError(null); }}
              disabled={pending !== null}
              className="flex-1 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              {sent === "request_check" ? "✓ Nota vine" : "Nota, vă rog"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="max-w-md mx-auto text-center text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
