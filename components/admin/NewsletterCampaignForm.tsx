"use client";

import { useState } from "react";
import { UploadButton } from "@/lib/uploadthing-client";
import { compressFiles } from "@/lib/image-compress";

type Audience = "events" | "places" | "news" | "experiences" | "all";

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "events", label: "Abonați la evenimente" },
  { value: "places", label: "Abonați la localuri noi" },
  { value: "news", label: "Abonați la știri" },
  { value: "experiences", label: "Abonați la experiențe noi" },
  { value: "all", label: "Toți abonații activi" },
];

interface SendResult {
  sent: number;
  skipped: number;
  failed: number;
  recipients: string[];
}

export default function NewsletterCampaignForm() {
  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [audience, setAudience] = useState<Audience>("events");

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
      const res = await fetch("/api/newsletter/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          heading,
          body,
          imageUrl: imageUrl || undefined,
          ctaLabel: ctaLabel || undefined,
          ctaHref: ctaHref || undefined,
          audience,
          dryRun,
        }),
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
    if (!confirm(`Trimiți campania "${subject}" către ${n} abonați?`)) return;
    await call(false);
  }

  const field = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c84b1e]";

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Campanie personalizată</h2>
      <p className="text-xs text-gray-500 mb-4">
        Trimite un email unic abonaților — un eveniment al unei afaceri din Brașov, un local nou
        deschis etc. Arată ca un email „Din Brașov”.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Subiect email</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={field} placeholder="Ex: Concert în Piața Sfatului — sâmbătă" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Titlu (în email)</label>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={150} className={field} placeholder="Ex: Te invităm la concert!" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mesaj</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={10000} className={`${field} resize-none`} placeholder="Scrie mesajul... Lasă o linie goală între paragrafe." />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Imagine (opțional)</label>
          {imageUrl ? (
            <div className="mb-2">
              <img src={imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg mb-1" />
              <button onClick={() => setImageUrl("")} className="text-xs text-red-600 hover:underline">Elimină imaginea</button>
            </div>
          ) : (
            <UploadButton
              endpoint="newsImage"
              onBeforeUploadBegin={compressFiles}
              onClientUploadComplete={(files) => { if (files[0]) setImageUrl(files[0].url); }}
              onUploadError={() => setError("Eroare la upload imagine.")}
              appearance={{
                button: "bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors",
                allowedContent: "hidden",
              }}
            />
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Text buton (opțional)</label>
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} className={field} placeholder="Ex: Vezi detalii" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Link buton (opțional)</label>
            <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} className={field} placeholder="https://..." />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Destinatari</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={`${field} bg-white`}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-4">
        <button
          onClick={() => call(true)}
          disabled={loading !== null || !valid}
          className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {loading === "preview" ? "Se calculează..." : "Previzualizează"}
        </button>
        <button
          onClick={handleSend}
          disabled={loading !== null || !preview || preview.recipients.length === 0}
          className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          {loading === "send" ? "Se trimite..." : "Trimite campanie"}
        </button>

        {preview && !result && (
          <span className="text-sm text-gray-600">{preview.recipients.length} destinatari</span>
        )}
        {result && (
          <span className="text-sm text-green-700 font-medium">
            ✓ Trimis către {result.sent} abonați{result.failed > 0 ? ` · ${result.failed} eșuate` : ""}
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
