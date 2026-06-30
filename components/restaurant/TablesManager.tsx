"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface TableData {
  id: string;
  label: string;
  menuUrl: string;
  qrDataUrl: string;
}

export default function TablesManager({
  restaurantId,
  restaurantName,
  logoUrl,
  initialTables,
}: {
  restaurantId: string;
  restaurantName: string;
  logoUrl: string;
  initialTables: TableData[];
}) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/restaurants/${restaurantId}/tables`;

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Eroare.");
      }
      return await res.json().catch(() => ({}));
    } catch (e: any) {
      setError(e?.message ?? "Eroare.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addTable() {
    const label = newLabel.trim();
    if (!label) return;
    const r = await call(base, "POST", { label });
    if (r) { setNewLabel(""); router.refresh(); }
  }

  async function deleteTable(t: TableData) {
    if (!confirm(`Ștergi „${t.label}"? Codul QR existent nu va mai funcționa.`)) return;
    const r = await call(`${base}/${t.id}`, "DELETE");
    if (r) router.refresh();
  }

  async function regenerate(t: TableData) {
    if (!confirm(`Generezi un cod QR nou pentru „${t.label}"? Codul vechi (deja printat) va înceta să funcționeze.`)) return;
    const r = await call(`${base}/${t.id}`, "PATCH", { action: "regenerate" });
    if (r) router.refresh();
  }

  // Horizontal business card, Din Brașov style (cream + terracotta), QR on the right.
  function cardHtml(t: TableData): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
      <div class="card">
        <div class="left">
          <div class="brand">
            <img class="logo" src="${logoUrl}" alt="" />
            <span class="brandname">Din <b>Brașov</b></span>
          </div>
          <div class="rest">${esc(restaurantName)}</div>
          <div class="table">${esc(t.label)}</div>
          <div class="cta">Scanează pentru meniu →</div>
        </div>
        <div class="right">
          <img class="qr" src="${t.qrDataUrl}" alt="Cod QR ${esc(t.label)}" />
        </div>
      </div>`;
  }

  function printCard(t: TableData) {
    const w = window.open("", "_blank", "width=720,height=420");
    if (!w) return;
    w.document.write(`
      <html><head><title>${restaurantName} — ${t.label}</title>
      <style>
        @page { margin: 16mm; }
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:24px;background:#fff;}
        .card{display:flex;align-items:center;gap:20px;background:#f4f1ec;border:2px solid #c84b1e;
          border-radius:20px;padding:24px 28px;max-width:560px;margin:0 auto;}
        .left{flex:1;}
        .brand{display:flex;align-items:center;gap:8px;margin-bottom:14px;}
        .logo{width:34px;height:34px;border-radius:50%;object-fit:cover;}
        .brandname{font-size:16px;font-weight:700;color:#1a1a1a;}
        .brandname b{color:#c84b1e;}
        .rest{font-size:22px;font-weight:800;color:#1a1a1a;line-height:1.15;}
        .table{font-size:15px;color:#6b7280;margin-top:2px;}
        .cta{font-size:14px;font-weight:600;color:#c84b1e;margin-top:14px;}
        .right{flex-shrink:0;}
        .qr{width:150px;height:150px;display:block;background:#fff;padding:8px;border-radius:12px;}
      </style></head><body>
        ${cardHtml(t)}
        <script>window.onload=()=>window.print()</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4 flex gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTable()}
          placeholder="Masă nouă (ex: Masa 8, Terasa 2)"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e]"
          maxLength={50}
        />
        <button
          onClick={addTable}
          disabled={busy || !newLabel.trim()}
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          Adaugă masă
        </button>
      </div>

      {initialTables.length === 0 ? (
        <p className="text-gray-500 text-sm">Nicio masă încă. Adaugă prima masă mai sus.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {initialTables.map((t) => (
            <div key={t.id} className="space-y-2">
              {/* Business-card preview — exactly what prints */}
              <div className="flex items-center gap-4 bg-[#f4f1ec] border-2 border-[#c84b1e] rounded-2xl p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <span className="text-sm font-bold text-gray-900">
                      Din <span className="text-[#c84b1e]">Brașov</span>
                    </span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 leading-tight truncate">{restaurantName}</p>
                  <p className="text-sm text-gray-500">{t.label}</p>
                  <p className="text-xs font-semibold text-[#c84b1e] mt-2">Scanează pentru meniu →</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.qrDataUrl} alt={`Cod QR ${t.label}`} className="w-28 h-28 bg-white p-1.5 rounded-lg flex-shrink-0" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => printCard(t)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a]">
                  Printează cardul
                </button>
                <button onClick={() => regenerate(t)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Cod nou
                </button>
                <button onClick={() => deleteTable(t)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                  Șterge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
