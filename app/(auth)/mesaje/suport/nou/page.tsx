"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export default function SuportNouPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3 || body.trim().length < 5) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/support/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Eroare la trimitere.");
      return;
    }

    router.push(`/mesaje/suport/${data.conversationId}`);
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/mesaje" className="text-gray-400 hover:text-gray-700 transition-colors" aria-label="Înapoi">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Mesaj nou către suport</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#e8d9c5] p-6">
        <p className="text-sm text-gray-500 mb-5">
          Echipa noastră va prelua solicitarea și va răspunde în cel mai scurt timp.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subiect
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              maxLength={100}
              placeholder="ex. Contestație suspendare cont"
              style={{ color: "#1a1a1a", backgroundColor: "#ffffff", colorScheme: "light" }}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mesaj
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={5}
              maxLength={2000}
              rows={6}
              placeholder="Descrie problema sau solicitarea ta..."
              style={{ color: "#1a1a1a", backgroundColor: "#ffffff", colorScheme: "light" }}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{body.length}/2000</p>
          </div>

          {error && (
            <p role="alert" className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Link
              href="/mesaje"
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-center text-sm"
            >
              Anulează
            </Link>
            <button
              type="submit"
              disabled={loading || subject.trim().length < 3 || body.trim().length < 5}
              className="flex-1 bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60 text-sm"
            >
              {loading ? "Se trimite..." : "Trimite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
