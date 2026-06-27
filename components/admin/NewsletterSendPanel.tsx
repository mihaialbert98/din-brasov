"use client";

import { useState } from "react";

interface SendResult {
  sent: number;
  skipped: number;
  failed: number;
  recipients: string[];
}

export default function NewsletterSendPanel() {
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);
  const [preview, setPreview] = useState<SendResult | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  async function call(dryRun: boolean) {
    setError(null);
    if (dryRun) setResult(null);
    setLoading(dryRun ? "preview" : "send");
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Eroare la trimitere.");
        return;
      }
      if (dryRun) setPreview(data);
      else {
        setResult(data);
        setPreview(null);
      }
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setLoading(null);
    }
  }

  async function handleSend() {
    const n = preview?.recipients.length ?? 0;
    const warn = force
      ? ` Atenție: vor primi și abonații cărora le-ai trimis recent.`
      : "";
    if (!confirm(`Trimiți newsletter-ul săptămânal către ${n} abonați?${warn}`)) return;
    await call(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Newsletter săptămânal</h2>
      <p className="text-xs text-gray-500 mb-3">
        Digest automat cu știrile, evenimentele și localurile noi din ultima săptămână. Fiecare
        abonat primește doar secțiunile la care s-a abonat.
      </p>

      <label className="flex items-center gap-2 text-xs text-gray-600 mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => { setForce(e.target.checked); setPreview(null); setResult(null); }}
          className="w-4 h-4 accent-[#c84b1e]"
        />
        Trimite oricum (include și abonații cărora le-am trimis recent)
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => call(true)}
          disabled={loading !== null}
          className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {loading === "preview" ? "Se calculează..." : "Previzualizează"}
        </button>

        <button
          onClick={handleSend}
          disabled={loading !== null || !preview || preview.recipients.length === 0}
          className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          {loading === "send" ? "Se trimite..." : "Trimite newsletter"}
        </button>

        {preview && !result && (
          <span className="text-sm text-gray-600">
            {preview.recipients.length} destinatari · {preview.skipped} omiși
          </span>
        )}

        {result && (
          <span className="text-sm text-green-700 font-medium">
            ✓ Trimis către {result.sent} abonați · {result.skipped} omiși
            {result.failed > 0 ? ` · ${result.failed} eșuate` : ""}
          </span>
        )}

        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
