"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";

/**
 * Admin action to assign a proprietor to a local. Posts the owner email + placeId
 * to the unified restaurants endpoint, which lazily creates the restaurant layer
 * (if missing) and adds the owner membership. The owner must already have an account.
 */
export default function AssignOwnerButton({
  placeId,
  localName,
  currentOwnerEmail,
}: {
  placeId: string;
  localName: string;
  currentOwnerEmail?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: localName, ownerEmail: email.trim(), placeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Eroare la asociere.");
        return;
      }
      setOpen(false);
      setEmail("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-3 h-11 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1"
        title={currentOwnerEmail ? "Schimbă proprietarul" : "Asociază un proprietar"}
      >
        <UserPlus className="w-3.5 h-3.5" aria-hidden />
        {currentOwnerEmail ? "Schimbă proprietar" : "Asociază proprietar"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900">Proprietar — {localName}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700" aria-label="Închide">
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Emailul unui cont existent. Dacă localul nu are încă meniu/rezervări, acestea se activează automat.
            </p>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="proprietar@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                Anulează
              </button>
              <button
                onClick={submit}
                disabled={loading || email.trim().length < 5}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] disabled:opacity-50"
              >
                {loading ? "Se salvează…" : "Salvează"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
