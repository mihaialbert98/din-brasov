"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

const REASONS = [
  "Anunț fals sau înșelător",
  "Produs interzis",
  "Spam sau duplicat",
  "Preț sau informații incorecte",
  "Alt motiv",
];

export function ReportButton({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch(`/api/listings/${listingId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setLoading(false);
    setDone(true);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors underline"
        aria-label="Raportează acest anunț"
      >
        Raportează anunț
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="font-serif text-lg font-semibold text-ink mb-4">Raportează anunț</h2>

            {done ? (
              <div className="flex flex-col items-center text-center py-4">
                <CheckCircle2 className="w-9 h-9 text-green-600 mb-2" aria-hidden />
                <p className="font-semibold text-ink">Raport trimis. Îți mulțumim!</p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 text-sm text-muted hover:underline"
                >
                  Închide
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        className="accent-accent w-4 h-4"
                      />
                      <span className="text-sm text-ink/70">{r}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 border border-hairline text-ink/70 font-medium py-2.5 rounded-lg hover:bg-cream/40 transition-colors text-sm"
                  >
                    Anulează
                  </button>
                  <button
                    type="submit"
                    disabled={!reason || loading}
                    className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {loading ? "Se trimite..." : "Raportează"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
