"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * Lets a user cancel their own reservation. Opens a modal offering two choices:
 * just cancel, or cancel + go rebook at the same restaurant.
 */
export default function CancelReservationButton({
  reservationId,
  placeSlug,
}: {
  reservationId: string;
  placeSlug: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel(rebook: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reservations/${reservationId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Eroare la anulare."); return; }
    if (rebook) {
      const slug = data.placeSlug ?? placeSlug;
      router.push(slug ? `/localuri/${slug}/rezervare` : "/localuri");
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
      >
        Anulează
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} disabled={busy} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700" aria-label="Închide">
              <X className="w-5 h-5" aria-hidden />
            </button>
            <h3 className="font-serif text-xl font-semibold text-gray-900 mb-1">Anulează rezervarea</h3>
            <p className="text-sm text-gray-500 mb-5">Ce vrei să faci?</p>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="space-y-2">
              <button
                onClick={() => cancel(false)}
                disabled={busy}
                className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {busy ? "Se anulează…" : "Doar anulează"}
              </button>
              <button
                onClick={() => cancel(true)}
                disabled={busy}
                className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl bg-[#c84b1e] text-white hover:bg-[#d9603a] transition-colors disabled:opacity-60"
              >
                Anulează și fă altă rezervare
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
