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
  initialTables,
}: {
  restaurantId: string;
  restaurantName: string;
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

  function printCard(t: TableData) {
    const w = window.open("", "_blank", "width=420,height=620");
    if (!w) return;
    w.document.write(`
      <html><head><title>${t.label} — ${restaurantName}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;margin:0;padding:32px;}
        .card{border:2px solid #1a1a1a;border-radius:16px;padding:28px;max-width:320px;margin:0 auto;}
        h1{font-size:20px;margin:0 0 4px;color:#1a1a1a;}
        .table{font-size:15px;color:#6b7280;margin:0 0 16px;}
        img{width:240px;height:240px;}
        .cta{font-size:15px;font-weight:600;margin:16px 0 4px;color:#1a1a1a;}
        .brand{font-size:12px;color:#9ca3af;margin-top:12px;}
        .brand b{color:#c84b1e;}
      </style></head><body>
        <div class="card">
          <h1>${restaurantName}</h1>
          <p class="table">${t.label}</p>
          <img src="${t.qrDataUrl}" alt="QR" />
          <p class="cta">Scanează pentru meniu</p>
          <p class="brand">Meniu digital prin <b>Din Brașov</b></p>
        </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {initialTables.map((t) => (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 flex flex-col items-center text-center">
              <p className="font-semibold text-gray-900 mb-2">{t.label}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.qrDataUrl} alt={`Cod QR ${t.label}`} className="w-40 h-40" />
              <p className="text-xs text-gray-400 mt-1 break-all">{t.menuUrl}</p>
              <div className="flex gap-2 mt-3 flex-wrap justify-center">
                <button onClick={() => printCard(t)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a]">
                  Printează
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
