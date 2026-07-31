"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users, Home, Trees, Phone } from "lucide-react";

export interface ResTableRow {
  id: string;
  label: string;
  seats: number;
  joinable: boolean;
  area: string | null;
  isActive: boolean;
  bookableOnline: boolean;
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
  const [notice, setNotice] = useState<string | null>(null);
  // Delete confirmation for a table that future guests are seated at.
  const [confirmDelete, setConfirmDelete] = useState<
    { table: ResTableRow; affected: number; bookings: { date: string; time: string; partySize: number; guestName: string }[]; isLastTable: boolean } | null
  >(null);

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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Eroare."); return null; }
      router.refresh();
      return d ?? {};
    } finally { setBusy(false); }
  }

  async function addTable() {
    const nSeats = seats === "" ? 0 : seats;
    if (!label.trim()) { setError("Dă un nume mesei (ex: Masa 1)."); return; }
    if (nSeats < 1) { setError("O masă are cel puțin 1 loc."); return; }
    const d = await call(base, "POST", { label: label.trim(), seats: nSeats, joinable, area: areasEnabled ? area : null });
    if (d) {
      setLabel(""); setSeats(2); setJoinable(false);
      // The new table may have seated bookings that were waiting without one.
      setNotice(d.assignedNow > 0 ? `Masă adăugată. Am atribuit mese pentru ${d.assignedNow} ${d.assignedNow === 1 ? "rezervare existentă" : "rezervări existente"}.` : null);
    }
  }

  /** Step 1: try to delete. If future guests sit there, the API refuses (409) and we
   *  ask the owner, offering the safe "Dezactivează" first. */
  async function deleteTable(t: ResTableRow) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${base}?tableId=${t.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.needsConfirm) {
        setConfirmDelete({ table: t, affected: d.affected, bookings: d.bookings ?? [], isLastTable: !!d.isLastTable });
        return;
      }
      if (!res.ok) { setError(d.error ?? "Eroare."); return; }
      router.refresh();
      if (d.isLastTable) setNotice("Masă ștearsă. Nu mai ai nicio masă — rezervările online sunt oprite până adaugi una.");
    } finally { setBusy(false); }
  }

  /** Step 2: the owner confirmed — delete, then re-seat the affected bookings. */
  async function forceDelete() {
    if (!confirmDelete) return;
    const t = confirmDelete.table;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}?tableId=${t.id}&force=true`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Eroare."); return; }
      setConfirmDelete(null);
      router.refresh();
      const moved = d.reassigned > 0 ? `Am mutat ${d.reassigned} ${d.reassigned === 1 ? "rezervare" : "rezervări"} pe alte mese.` : "";
      const stuck = (d.unassigned ?? []).length
        ? ` ${d.unassigned.length} ${d.unassigned.length === 1 ? "rezervare nu a încăput nicăieri" : "rezervări nu au încăput nicăieri"} — sună clienții: ` +
          d.unassigned.map((u: any) => `${u.date} ${u.time} ${u.guestName} (${u.partySize}p)`).join("; ")
        : "";
      setNotice(`Masa „${t.label}" a fost ștearsă. ${moved}${stuck}`.trim());
      if (stuck) setError(`Atenție:${stuck}`);
    } finally { setBusy(false); }
  }

  /** The safe alternative offered in the dialog. */
  async function deactivateInstead() {
    if (!confirmDelete) return;
    const t = confirmDelete.table;
    setConfirmDelete(null);
    const d = await call(`${base}?tableId=${t.id}`, "PATCH", { isActive: false });
    if (d) setNotice(`Masa „${t.label}" a fost dezactivată. Rezervările existente rămân pe ea; nimeni altcineva nu o poate rezerva.`);
  }

  const active = initialTables.filter((t) => t.isActive);
  const totalSeats = active.reduce((s, t) => s + t.seats, 0);
  // Tables the public form can actually reach — the rest are held for walk-ins.
  const onlineTables = active.filter((t) => t.bookableOnline);
  // Zones on but no area set → matches neither zone, so clients can never book it.
  const noZoneTables = areasEnabled ? active.filter((t) => !t.area) : [];
  const onlineSeats = onlineTables.reduce((s, t) => s + t.seats, 0);
  const heldSeats = totalSeats - onlineSeats;
  const fieldClass = "border border-gray-300 rounded-lg px-3 h-[38px] text-sm focus:outline-none focus:border-[#c84b1e]";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-semibold text-gray-900">Mese pentru rezervări</h3>
        <span className="text-xs text-gray-400">
          {active.length} mese · {heldSeats > 0 ? `${onlineSeats} locuri online · ${heldSeats} pentru walk-in` : `${totalSeats} locuri`}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Disponibilitatea se calculează după mese: un client vede o oră liberă doar dacă există o masă
        (sau o combinație de mese unite) care încape grupul lui. Vrei să păstrezi câteva locuri pentru
        clienții care vin fără rezervare? Apasă „Ține pentru walk-in” — masa dispare din formularul
        online, dar tu o poți rezerva în continuare.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {notice && <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{notice}</p>}
      {/* Online booking is off whenever NO table is reachable by clients — not only
          when the list is empty. Deactivating every table, or holding them all back
          for walk-ins, produces the same silent dead end: the restaurant still shows
          „Rezervă o masă” publicly but every hour comes back full. Each case names
          the exact control that fixes it. */}
      {/* Defensive: with zones on, an area-less table is invisible to clients in BOTH
          zones. Enabling zones now assigns one automatically, so this should never
          appear — but if it does, it names the exact tables to fix. */}
      {areasEnabled && noZoneTables.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {noZoneTables.length === 1 ? "O masă nu are zonă" : `${noZoneTables.length} mese nu au zonă`} ({noZoneTables.map((t) => t.label).join(", ")}) —
          clienții nu o pot rezerva nici la interior, nici pe terasă. Alege zona din lista de mai jos.
        </p>
      )}

      {onlineTables.length === 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {initialTables.length === 0
            ? "Nu ai nicio masă — rezervările online sunt oprite. Adaugă cel puțin o masă sau treci pe „Capacitate totală”."
            : active.length === 0
            ? "Toate mesele sunt dezactivate — clienții nu pot rezerva online. Apasă „Activează” la cel puțin o masă."
            : "Toate mesele sunt ținute pentru walk-in — clienții nu pot rezerva online. Apasă „Redă online” la cel puțin o masă."}
        </p>
      )}

      {initialTables.length > 0 && (
        <ul className="divide-y divide-gray-100 mb-4">
          {initialTables.map((t) => {
            // Terrace tables are parked while zones are off — the "Interior & terasă"
            // toggle is what closes/reopens the terrace, so it governs them, not this row.
            const parkedTerrace = !areasEnabled && t.area === "outside";
            return (
            <li key={t.id} className={`py-2.5 flex items-center gap-3 ${t.isActive ? "" : "opacity-50"}`}>
              <span className="font-medium text-gray-900 flex-1 truncate">{t.label}</span>
              <span className="inline-flex items-center gap-1 text-sm text-gray-600"><Users className="w-3.5 h-3.5" aria-hidden /> {t.seats}</span>
              {/* Zones on → the table must belong to one, and the owner must be able
                  to move it. A table with no zone matches neither and is unbookable,
                  so it is flagged here instead of silently vanishing from the form. */}
              {areasEnabled && (
                <label className="inline-flex items-center gap-1 text-xs">
                  {t.area === "outside" ? <Trees className="w-3 h-3 text-blue-700 flex-shrink-0" aria-hidden /> : <Home className="w-3 h-3 text-blue-700 flex-shrink-0" aria-hidden />}
                  <span className="sr-only">Zona mesei {t.label}</span>
                  <select
                    value={t.area ?? ""}
                    onChange={(e) => call(`${base}?tableId=${t.id}`, "PATCH", { area: e.target.value })}
                    disabled={busy}
                    className={`border rounded px-1.5 py-1 text-xs bg-white disabled:opacity-50 ${
                      t.area ? "border-gray-300 text-blue-700" : "border-amber-400 text-amber-800"
                    }`}
                  >
                    {!t.area && <option value="">Fără zonă</option>}
                    <option value="inside">Interior</option>
                    <option value="outside">Terasă</option>
                  </select>
                </label>
              )}
              {t.joinable && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">se poate uni</span>}
              {!t.bookableOnline && t.isActive && (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                  <Phone className="w-3 h-3 flex-shrink-0" aria-hidden /> doar walk-in
                </span>
              )}
              {t.isActive && !parkedTerrace && (
                <button
                  onClick={() => call(`${base}?tableId=${t.id}`, "PATCH", { bookableOnline: !t.bookableOnline })}
                  disabled={busy}
                  title={t.bookableOnline
                    ? "Ascunde masa din formularul clienților — o poți rezerva în continuare tu, la telefon sau pentru walk-in."
                    : "Fă masa disponibilă din nou pentru rezervările online."}
                  className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {t.bookableOnline ? "Ține pentru walk-in" : "Redă online"}
                </button>
              )}
              {parkedTerrace ? (
                <span
                  className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded"
                  title="Activează „Interior & terasă” din setări ca să folosești din nou mesele de pe terasă."
                >
                  <Trees className="w-3 h-3 flex-shrink-0" aria-hidden />
                  Masă setată pentru terasă — activează „Interior &amp; terasă”
                </span>
              ) : (
                <button onClick={() => call(`${base}?tableId=${t.id}`, "PATCH", { isActive: !t.isActive })} disabled={busy}
                  className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50">
                  {t.isActive ? "Dezactivează" : "Activează"}
                </button>
              )}
              <button onClick={() => deleteTable(t)} disabled={busy}
                className="text-gray-300 hover:text-red-600 disabled:opacity-50" aria-label="Șterge masa">
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </li>
            );
          })}
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

      {/* Deleting a table future guests are seated at — offer the safe option first. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg">Ștergi masa „{confirmDelete.table.label}”?</h3>
            <p className="text-sm text-gray-600 mt-2">
              {confirmDelete.affected === 1 ? "O rezervare viitoare este" : `${confirmDelete.affected} rezervări viitoare sunt`} la această masă.
              Dacă o ștergi, încercăm să {confirmDelete.affected === 1 ? "o mutăm" : "le mutăm"} pe alte mese libere — iar
              cele care nu încap îți vor fi afișate ca să suni clienții.
            </p>
            {confirmDelete.isLastTable && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                Aceasta e ultima masă. Fără mese, nu se mai pot face rezervări online în modul „Mese individuale”.
              </p>
            )}
            {confirmDelete.bookings.length > 0 && (
              <ul className="mt-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
                {confirmDelete.bookings.map((b, i) => (
                  <li key={i}>{b.date} · {b.time} — {b.guestName} ({b.partySize} pers.)</li>
                ))}
              </ul>
            )}
            <p className="text-sm text-gray-600 mt-3">
              Dacă masa e scoasă din uz doar temporar, <strong>dezactiveaz-o</strong> — rezervările rămân pe ea și nimeni altcineva nu o poate rezerva.
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={deactivateInstead} disabled={busy}
                className="w-full bg-[#1a1a1a] text-white font-semibold py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-60">
                Dezactivează masa (recomandat)
              </button>
              <div className="flex gap-2">
                <button onClick={forceDelete} disabled={busy}
                  className="flex-1 border border-red-300 text-red-600 font-medium py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-60">
                  Șterge oricum
                </button>
                <button onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50">
                  Anulează
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
