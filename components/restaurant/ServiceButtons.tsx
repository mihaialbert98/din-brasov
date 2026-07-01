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

  // Shared control styling — consistent height, radius, weight, states.
  const btnBase =
    "flex-1 font-semibold text-[15px] h-12 rounded-xl transition-colors duration-150 disabled:opacity-55 disabled:cursor-not-allowed";
  const barStyle: React.CSSProperties = {
    background: "var(--menu-surface)",
    borderTop: "1px solid var(--menu-border)",
    boxShadow: "0 -2px 12px rgba(28,25,23,0.06)",
    paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
  };

  if (disabled) {
    return (
      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 text-center" style={barStyle}>
        <p className="max-w-md mx-auto text-sm" style={{ color: "var(--menu-muted)" }}>
          Masa este momentan indisponibilă.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 pt-3" style={barStyle}>
      <div className="max-w-md mx-auto">
        {choosingPay ? (
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium flex-shrink-0" style={{ color: "var(--menu-muted)" }}>
              Plătești cu:
            </span>
            <button
              onClick={() => send("request_check", "cash")}
              disabled={pending !== null}
              className={btnBase}
              style={{ background: "var(--menu-text)", color: "var(--menu-surface)" }}
            >
              Numerar
            </button>
            <button
              onClick={() => send("request_check", "card")}
              disabled={pending !== null}
              className={btnBase}
              style={{ background: "var(--menu-text)", color: "var(--menu-surface)" }}
            >
              Card
            </button>
            <button
              onClick={() => setChoosingPay(false)}
              className="flex-shrink-0 w-9 h-9 rounded-full grid place-items-center transition-colors"
              style={{ color: "var(--menu-muted)", background: "var(--menu-bg)", minHeight: "auto" }}
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
              className={btnBase}
              style={{ background: "var(--brand)", color: "var(--brand-contrast)" }}
            >
              {sent === "call_waiter" ? "✓ Vine imediat" : pending === "call_waiter" ? "…" : "Cheamă ospătarul"}
            </button>
            <button
              onClick={() => { setChoosingPay(true); setError(null); }}
              disabled={pending !== null}
              className={btnBase}
              style={{ background: "var(--menu-text)", color: "var(--menu-surface)" }}
            >
              {sent === "request_check" ? "✓ Nota vine" : "Nota, vă rog"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="max-w-md mx-auto text-center text-xs mt-2" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}
    </div>
  );
}
