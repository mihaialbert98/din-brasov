"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface TableData {
  id: string;
  label: string;
  menuUrl: string;
  isActive: boolean;
}

export default function TablesManager({
  restaurantId,
  restaurantName,
  initialTables,
  isAdmin,
}: {
  restaurantId: string;
  restaurantName: string;
  initialTables: TableData[];
  isAdmin: boolean; // platform staff → full controls; owner → toggle-only
}) {
  const router = useRouter();
  const [addCount, setAddCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a QR regenerate so the <img> card re-fetches instead of showing a cached PNG.
  const [cacheKey, setCacheKey] = useState(0);

  const base = `/api/restaurants/${restaurantId}/tables`;

  async function toggleActive(t: TableData) {
    const r = await call(`${base}/${t.id}`, "PATCH", { action: "toggle", isActive: !t.isActive });
    if (r) router.refresh();
  }

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

  async function addTables() {
    const count = Math.max(1, Math.min(100, Math.floor(addCount)));
    const r = await call(base, "POST", { count });
    if (r) { setAddCount(1); router.refresh(); }
  }

  async function deleteTable(t: TableData) {
    if (!confirm(`Ștergi „${t.label}"? Codul QR existent nu va mai funcționa.`)) return;
    const r = await call(`${base}/${t.id}`, "DELETE");
    if (r) router.refresh();
  }

  async function regenerate(t: TableData) {
    if (!confirm(`Generezi un cod QR nou pentru „${t.label}"? Codul vechi (deja printat) va înceta să funcționeze.`)) return;
    const r = await call(`${base}/${t.id}`, "PATCH", { action: "regenerate" });
    if (r) { setCacheKey((k) => k + 1); router.refresh(); }
  }

  // The card is the server-composited PNG (QR + name overlaid on the brand template).
  const cardUrl = (t: TableData) => `${base}/${t.id}/card`;

  function printCard(t: TableData) {
    const w = window.open("", "_blank", "width=820,height=560");
    if (!w) return;
    w.document.write(`
      <html><head><title>${restaurantName} — ${t.label}</title>
      <style>
        @page { margin: 10mm; }
        body{margin:0;padding:16px;background:#fff;text-align:center;}
        img{max-width:100%;height:auto;}
      </style></head><body>
        <img src="${cardUrl(t)}" alt="Card ${t.label}" onload="window.print()" />
      </body></html>`);
    w.document.close();
  }

  function downloadCard(t: TableData) {
    const a = document.createElement("a");
    a.href = cardUrl(t);
    a.download = `card-${t.label.replace(/\s+/g, "-").toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Add tables — platform-admin only. */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <label className="text-sm font-medium text-gray-700">Adaugă mese</label>
          <p className="text-xs text-gray-500 mt-0.5 mb-2">
            Mesele se numerotează automat (Masa 1, Masa 2, …). Alege câte mese vrei să adaugi.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              value={addCount}
              onChange={(e) => setAddCount(parseInt(e.target.value) || 1)}
              onKeyDown={(e) => e.key === "Enter" && addTables()}
              className="w-24 border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e]"
            />
            <button
              onClick={addTables}
              disabled={busy || addCount < 1}
              className="bg-[#c84b1e] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
            >
              {addCount === 1 ? "Adaugă o masă" : `Adaugă ${addCount} mese`}
            </button>
          </div>
        </div>
      )}

      {initialTables.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {isAdmin ? "Nicio masă încă. Adaugă prima masă mai sus." : "Mesele vor fi configurate de echipa Din Brașov."}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {initialTables.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-700">{t.label}</p>
                {/* Enable/disable — available to owner AND admin. */}
                <button
                  onClick={() => toggleActive(t)}
                  disabled={busy}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
                    t.isActive
                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                      : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  }`}
                >
                  {t.isActive ? "Activă" : "Dezactivată"}
                </button>
              </div>
              {/* Composited business card (QR + name + table label on the template). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${cardUrl(t)}?v=${cacheKey}`}
                alt={`Card ${t.label}`}
                className={`w-full rounded-xl border border-gray-200 shadow-sm ${t.isActive ? "" : "opacity-50"}`}
              />
              {isAdmin && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => printCard(t)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a]">
                    Printează
                  </button>
                  <button onClick={() => downloadCard(t)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#c84b1e] text-[#c84b1e] hover:bg-[#c84b1e]/5">
                    Descarcă
                  </button>
                  <button onClick={() => regenerate(t)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Cod nou
                  </button>
                  <button onClick={() => deleteTable(t)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                    Șterge
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
