"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Flag, CheckCircle2 } from "lucide-react";

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
        className="text-xs text-faint hover:text-red-500 transition-colors flex items-center gap-1"
      >
        <Flag className="w-3.5 h-3.5" aria-hidden />
        Raportează utilizatorul
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-serif text-lg font-semibold text-ink mb-1">
              Raportează utilizatorul
            </h2>
            {reportedUserName && (
              <p className="text-sm text-muted mb-4">{reportedUserName}</p>
            )}

            {done ? (
              <div className="flex flex-col items-center text-center py-6">
                <CheckCircle2 className="w-10 h-10 text-green-600 mb-2" aria-hidden />
                <p className="font-semibold text-ink">Raport trimis.</p>
                <p className="text-sm text-muted mt-1">
                  Echipa noastră va analiza sesizarea în cel mai scurt timp.
                </p>
                <button
                  onClick={() => { setOpen(false); setDone(false); setReason(""); }}
                  className="mt-4 text-sm text-accent hover:underline"
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
                    className="w-full border border-hairline rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
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
                    className="flex-1 border border-hairline text-ink/70 font-medium py-2.5 rounded-lg hover:bg-cream/40 transition-colors"
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
