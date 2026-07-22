"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users, Home, Trees } from "lucide-react";

export interface ResTableRow {
  id: string;
  label: string;
  seats: number;
  joinable: boolean;
  area: string | null;
  isActive: boolean;
}

/**
 * Manage the reservation table inventory (tables-capacity mode). Add tables with a
 * label + seats + joinable flag (+ area when the restaurant splits interior/terasă),
 * toggle active, delete. Availability is then computed from these tables.
 */
export default function ReservationTablesManager({
  restaurantId,
  areasEnabled,
  initialTables,
}: {
  restaurantId: string;
  areasEnabled: boolean;
  initialTables: ResTableRow[];
}) {
  const router = useRouter();
  const base = `/api/restaurants/${restaurantId}/reservation-tables`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-table draft.
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState<number | "">(2);
  const [joinable, setJoinable] = useState(false);
  const [area, setArea] = useState<"inside" | "outside">("inside");

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Eroare."); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  async function addTable() {
    const nSeats = seats === "" ? 0 : seats;
    if (!label.trim()) { setError("Dă un nume mesei (ex: Masa 1)."); return; }
    if (nSeats < 1) { setError("O masă are cel puțin 1 loc."); return; }
    const ok = await call(base, "POST", { label: label.trim(), seats: nSeats, joinable, area: areasEnabled ? area : null });
    if (ok) { setLabel(""); setSeats(2); setJoinable(false); }
  }

  const totalSeats = initialTables.filter((t) => t.isActive).reduce((s, t) => s + t.seats, 0);
  const fieldClass = "border border-gray-300 rounded-lg px-3 h-[38px] text-sm focus:outline-none focus:border-[#c84b1e]";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-semibold text-gray-900">Mese pentru rezervări</h3>
        <span className="text-xs text-gray-400">{initialTables.filter((t) => t.isActive).length} mese · {totalSeats} locuri</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Disponibilitatea se calculează după mese: un client vede o oră liberă doar dacă există o masă
        (sau o combinație de mese unite) care încape grupul lui.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {initialTables.length > 0 && (
        <ul className="divide-y divide-gray-100 mb-4">
          {initialTables.map((t) => (
            <li key={t.id} className={`py-2.5 flex items-center gap-3 ${t.isActive ? "" : "opacity-50"}`}>
              <span className="font-medium text-gray-900 flex-1 truncate">{t.label}</span>
              <span className="inline-flex items-center gap-1 text-sm text-gray-600"><Users className="w-3.5 h-3.5" aria-hidden /> {t.seats}</span>
              {areasEnabled && t.area && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                  {t.area === "inside" ? <><Home className="w-3 h-3" aria-hidden /> Interior</> : <><Trees className="w-3 h-3" aria-hidden /> Terasă</>}
                </span>
              )}
              {t.joinable && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">se poate uni</span>}
              <button onClick={() => call(`${base}?tableId=${t.id}`, "PATCH", { isActive: !t.isActive })} disabled={busy}
                className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50">
                {t.isActive ? "Dezactivează" : "Activează"}
              </button>
              <button onClick={() => { if (confirm(`Ștergi „${t.label}"?`)) call(`${base}?tableId=${t.id}`, "DELETE"); }} disabled={busy}
                className="text-gray-300 hover:text-red-600 disabled:opacity-50" aria-label="Șterge masa">
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add-table row */}
      <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Nume
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Masa 1" className={`${fieldClass} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Locuri
          <input type="number" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value === "" ? "" : Number(e.target.value))} className={`${fieldClass} w-20 text-center`} />
        </label>
        {areasEnabled && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Zonă
            <select value={area} onChange={(e) => setArea(e.target.value as "inside" | "outside")} className={fieldClass}>
              <option value="inside">Interior</option>
              <option value="outside">Terasă</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-700 h-[38px] cursor-pointer select-none">
          <input type="checkbox" checked={joinable} onChange={(e) => setJoinable(e.target.checked)} className="accent-[#c84b1e]" />
          Se poate uni
        </label>
        <button onClick={addTable} disabled={busy} className="inline-flex items-center gap-1 bg-[#1a1a1a] text-white text-sm h-[38px] px-3 rounded-lg hover:bg-gray-700 disabled:opacity-50">
          <Plus className="w-4 h-4" aria-hidden /> Adaugă masă
        </button>
      </div>
    </div>
  );
}
