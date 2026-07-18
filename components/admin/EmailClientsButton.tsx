"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";

interface SendResult { sent: number; skipped: number; failed: number; recipients: string[]; }

/**
 * Admin composer to email a restaurant's consented (newsletter-subscribed) clients.
 * Subject / heading / body / optional CTA, with a dry-run recipient preview before send.
 */
export default function EmailClientsButton({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string;
  restaurantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);
  const [preview, setPreview] = useState<SendResult | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = subject.trim().length >= 3 && heading.trim().length >= 3 && body.trim().length >= 10;

  async function call(dryRun: boolean) {
    setError(null);
    if (dryRun) setResult(null);
    setLoading(dryRun ? "preview" : "send");
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}/email-clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, heading, body,
          ctaLabel: ctaLabel.trim() || undefined,
          ctaHref: ctaHref.trim() || undefined,
          dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Eroare."); return; }
      if (dryRun) setPreview(data); else { setResult(data); setPreview(null); }
    } finally {
      setLoading(null);
    }
  }

  function send() {
    const n = preview?.recipients.length ?? 0;
    if (!confirm(`Trimiți acest email către ${n} clienți abonați ai restaurantului ${restaurantName}?`)) return;
    call(false);
  }

  const field = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#6bb5d4] text-[#3a7fa0] hover:bg-[#6bb5d4]/10 inline-flex items-center gap-1"
      >
        <Mail className="w-3.5 h-3.5" aria-hidden /> Email clienți
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900">Email către clienții — {restaurantName}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700" aria-label="Închide"><X className="w-5 h-5" aria-hidden /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Se trimite doar clienților care s-au abonat la newsletter (consimțământ). Fiecare email are link de dezabonare.
            </p>

            {result ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                Trimis: {result.sent} · Sărite: {result.skipped} · Eșuate: {result.failed}
                <button onClick={() => { setOpen(false); setResult(null); }} className="block mt-3 text-xs font-semibold underline">Închide</button>
              </div>
            ) : (
              <div className="space-y-3">
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <label className="block text-xs font-medium text-gray-600">Subiect
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={`mt-1 ${field}`} placeholder="Ex: O ofertă specială pentru tine" />
                </label>
                <label className="block text-xs font-medium text-gray-600">Titlu (în email)
                  <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={150} className={`mt-1 ${field}`} />
                </label>
                <label className="block text-xs font-medium text-gray-600">Mesaj
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={10000} className={`mt-1 ${field}`} placeholder="Un rând gol = paragraf nou." />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-gray-600">Buton — text (opțional)
                    <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} className={`mt-1 ${field}`} />
                  </label>
                  <label className="block text-xs font-medium text-gray-600">Buton — link (opțional)
                    <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} className={`mt-1 ${field}`} placeholder="https://…" />
                  </label>
                </div>

                {preview && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    {preview.recipients.length} destinatari abonați vor primi acest email.
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={() => call(true)} disabled={!valid || loading !== null} className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {loading === "preview" ? "Se verifică…" : "Previzualizează destinatari"}
                  </button>
                  <button onClick={send} disabled={!valid || !preview || loading !== null} className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] disabled:opacity-50">
                    {loading === "send" ? "Se trimite…" : "Trimite"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
