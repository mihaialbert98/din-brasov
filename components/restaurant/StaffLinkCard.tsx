"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shows the shareable staff-board link + QR and lets the owner regenerate it.
 * Waiters open this link on their phones to reach the shared service board — no
 * login. Regenerating revokes the old link (staff who left lose access).
 */
export default function StaffLinkCard({
  restaurantId,
  staffUrl,
  qrDataUrl,
  canRegenerate,
}: {
  restaurantId: string;
  staffUrl: string;
  qrDataUrl: string;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(staffUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  async function regenerate() {
    if (!confirm("Generezi un cod nou? Link-ul actual nu va mai funcționa — va trebui să trimiți noul link ospătarilor.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/staff-token/regenerate`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 423 = menu-edit lock; the owner unlocks on the Meniu/Aspect page.
        setError(
          res.status === 423
            ? "Deblochează editarea (cu codul de pe email, din secțiunea Meniu) înainte de a genera un cod nou."
            : d.error ?? "Eroare la generare."
        );
        return;
      }
      router.refresh();
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-semibold text-gray-900">Link pentru ospătari</h2>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">
        Trimite acest link ospătarilor sau lasă-i să scaneze codul. Oricine îl are vede cererile de la
        mese, fără cont. Generează un cod nou când pleacă un angajat.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Cod QR serviciu" className="w-32 h-32 rounded-lg border border-gray-200 flex-shrink-0" />

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <input
            readOnly
            value={staffUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50 focus:outline-none"
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={copy}
              className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors"
            >
              {copied ? "✓ Copiat" : "Copiază link"}
            </button>
            <button
              onClick={regenerate}
              disabled={busy || !canRegenerate}
              title={canRegenerate ? undefined : "Deblochează editarea în secțiunea Meniu întâi."}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {busy ? "..." : "Generează cod nou"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!canRegenerate && !error && (
            <p className="text-xs text-gray-400">
              Pentru a genera un cod nou, deblochează editarea meniului (codul de pe email).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
