"use client";

import { useState } from "react";

type RequestType = "call_waiter" | "request_check";

export default function ServiceButtons({ token }: { token: string }) {
  const [pending, setPending] = useState<RequestType | null>(null);
  const [sent, setSent] = useState<RequestType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(type: RequestType) {
    setPending(type);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Eroare. Încearcă din nou.");
        return;
      }
      setSent(type);
      // Let the diner send again after a short while (e.g. nobody came).
      setTimeout(() => setSent((s) => (s === type ? null : s)), 8000);
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="max-w-md mx-auto flex gap-3">
        <button
          onClick={() => send("call_waiter")}
          disabled={pending !== null}
          className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-xl hover:bg-[#d9603a] transition-colors disabled:opacity-60"
        >
          {sent === "call_waiter" ? "✓ Vine imediat" : pending === "call_waiter" ? "..." : "Cheamă ospătarul"}
        </button>
        <button
          onClick={() => send("request_check")}
          disabled={pending !== null}
          className="flex-1 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-60"
        >
          {sent === "request_check" ? "✓ Nota vine" : pending === "request_check" ? "..." : "Nota, vă rog"}
        </button>
      </div>
      {error && <p className="max-w-md mx-auto text-center text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
