"use client";

import { useState } from "react";

type RequestType = "call_waiter" | "request_check";
type PaymentMethod = "cash" | "card";
type Lang = "ro" | "en";

const LABELS: Record<Lang, Record<string, string>> = {
  ro: {
    callWaiter: "Cheamă ospătarul",
    requestCheck: "Nota, vă rog",
    waiterComing: "✓ Vine imediat",
    checkComing: "✓ Nota vine",
    payingWith: "Plătești cu:",
    cash: "Numerar",
    card: "Card",
    cancel: "Anulează",
    tableUnavailable: "Masa este momentan indisponibilă.",
    networkError: "Eroare de rețea. Încearcă din nou.",
    genericError: "Eroare. Încearcă din nou.",
  },
  en: {
    callWaiter: "Call the waiter",
    requestCheck: "The bill, please",
    waiterComing: "✓ On the way",
    checkComing: "✓ Bill coming",
    payingWith: "Paying by:",
    cash: "Cash",
    card: "Card",
    cancel: "Cancel",
    tableUnavailable: "This table is currently unavailable.",
    networkError: "Network error. Please try again.",
    genericError: "Something went wrong. Please try again.",
  },
};

export default function ServiceButtons({
  token,
  disabled = false,
  lang = "ro",
}: {
  token: string;
  disabled?: boolean;
  lang?: Lang;
}) {
  const L = LABELS[lang];
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
        setError(d.error ?? L.genericError);
        return;
      }
      setSent(type);
      setChoosingPay(false);
      // Let the diner send again after a short while (e.g. nobody came).
      setTimeout(() => setSent((s) => (s === type ? null : s)), 8000);
    } catch {
      setError(L.networkError);
    } finally {
      setPending(null);
    }
  }

  // Shared control styling — consistent height, radius, weight, states.
  const btnBase =
    "flex-1 font-semibold text-[14px] tracking-wide h-[52px] transition-colors duration-200 disabled:opacity-55 disabled:cursor-not-allowed";
  const btnRadius = { borderRadius: "var(--menu-radius-sm)" };
  const barStyle: React.CSSProperties = {
    background: "color-mix(in srgb, var(--menu-surface) 94%, transparent)",
    borderTop: "1px solid var(--menu-border)",
    boxShadow: "0 -1px 16px rgba(28,25,23,0.05)",
    backdropFilter: "blur(10px)",
    paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
  };

  if (disabled) {
    return (
      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 text-center" style={barStyle}>
        <p className="max-w-md mx-auto text-sm" style={{ color: "var(--menu-muted)" }}>
          {L.tableUnavailable}
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
              {L.payingWith}
            </span>
            <button
              onClick={() => send("request_check", "cash")}
              disabled={pending !== null}
              className={btnBase}
              style={{ background: "var(--menu-text)", color: "var(--menu-surface)", ...btnRadius }}
            >
              {L.cash}
            </button>
            <button
              onClick={() => send("request_check", "card")}
              disabled={pending !== null}
              className={btnBase}
              style={{ background: "var(--menu-text)", color: "var(--menu-surface)", ...btnRadius }}
            >
              {L.card}
            </button>
            <button
              onClick={() => setChoosingPay(false)}
              className="flex-shrink-0 w-9 h-9 rounded-full grid place-items-center transition-colors"
              style={{ color: "var(--menu-muted)", background: "var(--menu-paper)", minHeight: "auto" }}
              aria-label={L.cancel}
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
              style={{ background: "var(--brand)", color: "var(--brand-contrast)", ...btnRadius }}
            >
              {sent === "call_waiter" ? L.waiterComing : pending === "call_waiter" ? "…" : L.callWaiter}
            </button>
            <button
              onClick={() => { setChoosingPay(true); setError(null); }}
              disabled={pending !== null}
              className={btnBase}
              style={{ background: "var(--menu-text)", color: "var(--menu-surface)", ...btnRadius }}
            >
              {sent === "request_check" ? L.checkComing : L.requestCheck}
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
