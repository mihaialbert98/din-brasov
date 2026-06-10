"use client";

import { useState } from "react";

export default function SupportInput({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/support/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setBody("");
    (window as any).__refreshSupportMessages?.();
  }

  return (
    <form onSubmit={handleSend} className="flex gap-3 items-end">
      <div className="flex-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as any);
            }
          }}
          placeholder="Scrie un mesaj... (Enter pentru trimite)"
          rows={2}
          maxLength={2000}
          style={{ color: "#111", backgroundColor: "#fff" }}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-none"
          aria-label="Mesaj suport"
        />
        {error && (
          <p role="alert" className="text-red-500 text-xs mt-1">{error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={loading || !body.trim()}
        className="bg-[#c84b1e] text-white font-semibold px-5 py-3 rounded-xl hover:bg-[#d9603a] transition-colors disabled:opacity-50 flex-shrink-0"
        aria-label="Trimite mesaj"
      >
        {loading ? "..." : "Trimite"}
      </button>
    </form>
  );
}
