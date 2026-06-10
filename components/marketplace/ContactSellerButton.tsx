"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function ContactSellerButton({
  listingId,
  listingTitle,
}: {
  listingId: string;
  listingTitle: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const formLoadedAt = useRef(Date.now());

  function handleOpen() {
    if (!session) {
      router.push("/intra");
      return;
    }
    formLoadedAt.current = Date.now();
    setOpen(true);
  }

  function containsUrl(text: string) {
    return /(https?:\/\/|t\.me\/|wa\.me\/|bit\.ly|tinyurl|goo\.gl)/i.test(text);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();

    if (containsUrl(body)) {
      setError("Mesajele nu pot conține linkuri. Te rugăm să nu incluzi adrese web.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/listings/${listingId}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        formLoadedAt: formLoadedAt.current,
        honeypot: "", // real users leave this empty
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setSent(true);
    if (data.conversationId) {
      setTimeout(() => router.push(`/mesaje/${data.conversationId}`), 1500);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
      >
        ✉️ {session ? "Trimite un mesaj" : "Autentifică-te pentru a scrie"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Trimite un mesaj
            </h2>
            <p className="text-sm text-gray-500 mb-4 line-clamp-1">
              Re: {listingTitle}
            </p>

            {sent ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">✅</p>
                <p className="font-semibold text-gray-900">Mesaj trimis!</p>
                <p className="text-sm text-gray-500 mt-1">Te redirecționăm spre conversație...</p>
              </div>
            ) : (
              <form onSubmit={handleSend} className="space-y-4">
                {/* Honeypot — hidden from real users */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute opacity-0 w-0 h-0"
                  autoComplete="off"
                />

                <div>
                  <label htmlFor="msg-body" className="block text-sm font-medium text-gray-700 mb-1">
                    Mesajul tău
                  </label>
                  <textarea
                    id="msg-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={5}
                    placeholder="Bună ziua, sunt interesat de anunțul dvs..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
                    style={{ color: "#1a1a1a", backgroundColor: "#ffffff", colorScheme: "light" }}
                  />
                  <p className="text-xs text-gray-400 mt-1 text-right">{body.length}/2000</p>
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
                    disabled={loading || body.length < 5}
                    className="flex-1 bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
                  >
                    {loading ? "Se trimite..." : "Trimite"}
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
