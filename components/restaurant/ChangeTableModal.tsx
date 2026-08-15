"use client";

import { useEffect, useState } from "react";
import { X, Users, Home, Trees, Phone } from "lucide-react";

type TableOption = {
  id: string;
  label: string;
  seats: number;
  area: string | null;
  joinable: boolean;
  bookableOnline: boolean;
  fits: boolean;
  busy: { reservationId: string; guestName: string; from: string; to: string } | null;
};

/**
 * „Schimbă masa” — override the table the engine picked, in „Mese individuale”.
 *
 * Unlike the „Plan de sală” picker (seats mode, where a table's size is irrelevant), the
 * seat count is the whole basis of this mode, so a table that can't hold the party is
 * refused just as firmly as one that's already taken. Both reasons are shown ON the table
 * rather than as an error after saving, so the owner can see at a glance what is actually
 * available to them.
 *
 * Selecting several tables combines them — the seats add up — which is how a big party
 * goes onto two tables pushed together.
 */
export default function ChangeTableModal({
  basePath,
  reservation,
  onClose,
  onSaved,
}: {
  basePath: string;
  reservation: { id: string; guestName: string; time: string; partySize: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${basePath}/reservations/${reservation.id}/tables`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setTables(d.tables ?? []);
        setSelected(d.current ?? []);
        setManual(!!d.manual);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setError("Nu am putut încărca mesele."); });
    return () => { cancelled = true; };
  }, [basePath, reservation.id]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`${basePath}/reservations/${reservation.id}/tables`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableIds: selected }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); return; }
    const d = await res.json().catch(() => ({}));
    setError(d.error ?? "Eroare.");
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));

  const seatsChosen = tables.filter((t) => selected.includes(t.id)).reduce((s, t) => s + t.seats, 0);
  const enough = seatsChosen >= reservation.partySize;
  const field = "w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className={`bg-white rounded-2xl max-w-md w-full p-5 shadow-xl ${field}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Schimbă masa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Închide"><X className="w-5 h-5" aria-hidden /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {reservation.guestName} · {reservation.time} · {reservation.partySize} pers.
          {manual && <span className="ml-1 text-gray-400">· masă aleasă de tine</span>}
        </p>

        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}

        {!loaded ? (
          <p className="text-sm text-gray-400 py-6 text-center">Se încarcă…</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Nu ai nicio masă activă în „Mese individuale”.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto mb-3">
              {tables.map((t) => {
                const isSelected = selected.includes(t.id);
                // Both refusals are permanent for this booking, so the row is inert and
                // says which one it is. A selected table stays clickable to deselect.
                const tooSmall = !t.fits && !isSelected && selected.length === 0;
                const blocked = (!!t.busy || tooSmall) && !isSelected;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      disabled={saving || !!t.busy}
                      className={`w-full text-left py-2.5 px-2 flex items-center gap-2 rounded-lg transition-colors ${
                        isSelected ? "bg-[#c84b1e]/5" : blocked ? "opacity-45" : "hover:bg-gray-50"
                      } ${t.busy ? "cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        disabled={!!t.busy}
                        className="accent-[#c84b1e] flex-shrink-0"
                        tabIndex={-1}
                      />
                      <span className="font-medium text-gray-900 flex-1 truncate">{t.label}</span>
                      {t.area && (
                        t.area === "outside"
                          ? <Trees className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" aria-label="Terasă" />
                          : <Home className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" aria-label="Interior" />
                      )}
                      {!t.bookableOnline && (
                        <Phone className="w-3 h-3 text-blue-600 flex-shrink-0" aria-label="Ținută pentru walk-in" />
                      )}
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600 tabular-nums flex-shrink-0">
                        <Users className="w-3.5 h-3.5" aria-hidden /> {t.seats}
                      </span>
                      {t.busy ? (
                        <span className="text-[11px] text-gray-500 flex-shrink-0">
                          {t.busy.guestName} · {t.busy.from}–{t.busy.to}
                        </span>
                      ) : !t.fits ? (
                        <span className="text-[11px] text-gray-400 flex-shrink-0">prea mică singură</span>
                      ) : (
                        <span className="text-[11px] text-green-700 flex-shrink-0">liberă</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${enough ? "text-green-900 bg-green-50 border border-green-200" : "text-amber-900 bg-amber-50 border border-amber-200"}`}>
              {selected.length === 0
                ? `Alege una sau mai multe mese pentru ${reservation.partySize} ${reservation.partySize === 1 ? "persoană" : "persoane"}.`
                : enough
                ? `${seatsChosen} locuri alese pentru ${reservation.partySize} ${reservation.partySize === 1 ? "persoană" : "persoane"}.`
                : `${seatsChosen} locuri alese — nu ajung pentru ${reservation.partySize}. Mai adaugă o masă.`}
            </p>

            <button
              onClick={save}
              disabled={saving || selected.length === 0 || !enough}
              className="w-full bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
            >
              {saving ? "Se salvează…" : "Salvează masa"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
