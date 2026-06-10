"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

type Props = {
  reportedUserId: string;
  reportedUserName?: string;
  listingId?: string;
  conversationId?: string;
};

export function ReportUserButton({
  reportedUserId,
  reportedUserName,
  listingId,
  conversationId,
}: Props) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show to authenticated users who aren't the reported user
  if (!session?.user?.id || session.user.id === reportedUserId) return null;
  const role = (session.user as any).role ?? "user";
  // Moderators and admins don't need the report button
  if (role === "moderator" || role === "admin") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/users/${reportedUserId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: reason.trim(),
        listingId,
        conversationId,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Eroare la trimitere.");
      return;
    }

    setDone(true);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
      >
        ⚑ Raportează utilizatorul
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Raportează utilizatorul
            </h2>
            {reportedUserName && (
              <p className="text-sm text-gray-500 mb-4">{reportedUserName}</p>
            )}

            {done ? (
              <div className="text-center py-6">
                <p className="text-3xl mb-2">✅</p>
                <p className="font-semibold text-gray-900">Raport trimis.</p>
                <p className="text-sm text-gray-500 mt-1">
                  Echipa noastră va analiza sesizarea în cel mai scurt timp.
                </p>
                <button
                  onClick={() => { setOpen(false); setDone(false); setReason(""); }}
                  className="mt-4 text-sm text-[#c84b1e] hover:underline"
                >
                  Închide
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivul raportului
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    minLength={10}
                    maxLength={500}
                    rows={4}
                    placeholder="Descrie pe scurt de ce raportezi acest utilizator (min. 10 caractere)..."
                    style={{ color: "#1a1a1a", backgroundColor: "#ffffff", colorScheme: "light" }}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-right">{reason.length}/500</p>
                </div>

                {error && (
                  <p role="alert" className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Anulează
                  </button>
                  <button
                    type="submit"
                    disabled={loading || reason.trim().length < 10}
                    className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
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
