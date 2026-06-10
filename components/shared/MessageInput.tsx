"use client";

import { useState, useRef } from "react";

type Props = {
  apiUrl: string;
  refreshKey?: string; // window.__<refreshKey>?.() called after send
  withAntiSpam?: boolean; // include formLoadedAt + honeypot (marketplace messages)
  urlCheck?: boolean; // enable client-side link blocking (marketplace only)
  placeholder?: string;
};

export function MessageInput({
  apiUrl,
  refreshKey,
  withAntiSpam = false,
  urlCheck = false,
  placeholder = "Scrie un mesaj... (Enter pentru trimite)",
}: Props) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formLoadedAt = useRef(Date.now());

  function containsUrl(text: string) {
    return /(https?:\/\/|t\.me\/|wa\.me\/|bit\.ly|tinyurl|goo\.gl)/i.test(text);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    if (urlCheck && containsUrl(body)) {
      setError("Mesajele nu pot conține linkuri. Te rugăm să nu incluzi adrese web.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: body.trim(),
        ...(withAntiSpam ? { formLoadedAt: formLoadedAt.current, honeypot: "" } : {}),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setBody("");
    formLoadedAt.current = Date.now();
    if (refreshKey) {
      (window as any)[`__${refreshKey}`]?.();
    }
  }

  return (
    <form onSubmit={handleSend} className="flex gap-3 items-start">
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
          placeholder={placeholder}
          rows={2}
          maxLength={2000}
          style={{
            color: "#111",
            backgroundColor: "#fff",
            minHeight: "3.25rem",
            height: "3.25rem",
          }}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-none"
          aria-label="Mesaj nou"
        />
        {error && (
          <p role="alert" className="text-red-500 text-xs mt-1">{error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={loading || !body.trim()}
        className="bg-[#c84b1e] text-white font-semibold w-24 py-3 rounded-xl hover:bg-[#d9603a] transition-colors disabled:opacity-50 flex-shrink-0"
        aria-label="Trimite mesaj"
      >
        {loading ? "..." : "Trimite"}
      </button>
    </form>
  );
}
