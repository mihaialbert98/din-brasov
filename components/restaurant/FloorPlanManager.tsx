"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Check, X, LayoutGrid } from "lucide-react";

export interface FloorSectionRow {
  id: string;
  label: string;
}

export interface FloorTableRow {
  id: string;
  label: string;
  sectionId: string | null;
  isActive: boolean;
}

const NO_SECTION = "__none__";

/**
 * Draw the room: tables grouped into the owner's own sections. No seat counts — these
 * tables record WHERE a booking sits, not how many people fit (that's „Mese individuale”).
 *
 * Nothing here affects what clients can book. Building a plan is optional, and so is
 * using it: bookings work exactly the same whether or not a table is ever chosen.
 */
export default function FloorPlanManager({
  restaurantId,
  initialSections,
  initialTables,
}: {
  restaurantId: string;
  initialSections: FloorSectionRow[];
  initialTables: FloorTableRow[];
}) {
  const router = useRouter();
  const sectionsBase = `/api/restaurants/${restaurantId}/floor-sections`;
  const tablesBase = `/api/restaurants/${restaurantId}/floor-tables`;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newSection, setNewSection] = useState("");
  const [renaming, setRenaming] = useState<{ kind: "section" | "table"; id: string; value: string } | null>(null);
  // Per-section draft table names, so typing in one section doesn't clear another.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<
    { table: FloorTableRow; affected: number; bookings: { date: string; time: string; partySize: number; guestName: string }[] } | null
  >(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Eroare."); return null; }
      router.refresh();
      return d ?? {};
    } finally { setBusy(false); }
  }

  async function addSection() {
    const label = newSection.trim();
    if (!label) { setError("Dă un nume secțiunii (ex: Sala 1)."); return; }
    if (await call(sectionsBase, "POST", { label })) setNewSection("");
  }

  async function addTable(sectionId: string) {
    const label = (drafts[sectionId] ?? "").trim();
    if (!label) { setError("Dă un nume mesei (ex: m1)."); return; }
    const d = await call(tablesBase, "POST", { label, sectionId: sectionId === NO_SECTION ? null : sectionId });
    if (d) setDrafts((s) => ({ ...s, [sectionId]: "" }));
  }

  async function saveRename() {
    if (!renaming) return;
    const label = renaming.value.trim();
    if (!label) { setError("Numele nu poate fi gol."); return; }
    const url = renaming.kind === "section" ? `${sectionsBase}?sectionId=${renaming.id}` : `${tablesBase}?tableId=${renaming.id}`;
    if (await call(url, "PATCH", { label })) setRenaming(null);
  }

  /** Deleting a section keeps its tables — they fall back to „Fără secțiune”. */
  async function deleteSection(s: FloorSectionRow) {
    const count = initialTables.filter((t) => t.sectionId === s.id).length;
    const warn = count > 0
      ? `Ștergi secțiunea „${s.label}”? Cele ${count} mese rămân, dar trec la „Fără secțiune”.`
      : `Ștergi secțiunea „${s.label}”?`;
    if (!confirm(warn)) return;
    if (await call(`${sectionsBase}?sectionId=${s.id}`, "DELETE")) {
      setNotice(count > 0 ? `Secțiune ștearsă. Mesele au trecut la „Fără secțiune”.` : "Secțiune ștearsă.");
    }
  }

  /** Step 1: try to delete. If bookings are pinned there, ask first (409). */
  async function deleteTable(t: FloorTableRow) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${tablesBase}?tableId=${t.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.needsConfirm) {
        setConfirmDelete({ table: t, affected: d.affected, bookings: d.bookings ?? [] });
        return;
      }
      if (!res.ok) { setError(d.error ?? "Eroare."); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  /** Step 2: confirmed — delete and detach it from those bookings. */
  async function forceDelete() {
    if (!confirmDelete) return;
    const t = confirmDelete.table;
    const d = await call(`${tablesBase}?tableId=${t.id}&force=true`, "DELETE");
    if (d) {
      setConfirmDelete(null);
      setNotice(
        d.detached > 0
          ? `Masa „${t.label}” a fost ștearsă. ${d.detached} ${d.detached === 1 ? "rezervare rămâne" : "rezervări rămân"} fără masă atribuită — le poți alege alta din tab-ul „Rezervări”.`
          : `Masa „${t.label}” a fost ștearsă.`,
      );
    }
  }

  const fieldClass = "border border-gray-300 rounded-lg px-3 h-[38px] text-sm focus:outline-none focus:border-[#c84b1e]";
  const orphans = initialTables.filter((t) => !t.sectionId);
  // „Fără secțiune” is only worth showing once something is in it — or when there is no
  // section at all yet, so the owner can add a table without inventing a section first.
  const buckets: { id: string; label: string; tables: FloorTableRow[]; section?: FloorSectionRow }[] = [
    ...initialSections.map((s) => ({
      id: s.id,
      label: s.label,
      section: s,
      tables: initialTables.filter((t) => t.sectionId === s.id),
    })),
    ...(orphans.length > 0 || initialSections.length === 0
      ? [{ id: NO_SECTION, label: "Fără secțiune", tables: orphans }]
      : []),
  ];
  const activeCount = initialTables.filter((t) => t.isActive).length;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="font-semibold text-gray-900">Mesele tale</h3>
          <span className="text-xs text-gray-400">
            {initialTables.length === 0
              ? "nicio masă"
              : `${activeCount} ${activeCount === 1 ? "masă activă" : "mese active"}`}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Adaugă mesele așa cum le numești tu (m1, m2, Colț fereastră…) și grupează-le pe secțiuni
          (Sala 1, Terasă, Etaj). Apoi, la fiecare rezervare, poți alege masa la care stă clientul —
          iar masa aceea rămâne ocupată pe durata rezervării, ca să nu o dai din greșeală și altcuiva.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          <strong className="font-medium text-gray-700">Nu ești obligat să atribui mese.</strong>{" "}
          Rezervările funcționează exact la fel și fără. Clientul nu vede niciodată masa — e doar
          pentru organizarea ta în sală. Disponibilitatea afișată clienților rămâne cea din
          „Capacitate totală”.
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        {notice && <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">{notice}</p>}
      </div>

      {buckets.map((b) => (
        <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            {renaming?.kind === "section" && renaming.id === b.id ? (
              <>
                <input
                  value={renaming.value}
                  onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(null); }}
                  maxLength={60}
                  autoFocus
                  className={`${fieldClass} flex-1`}
                />
                <button onClick={saveRename} disabled={busy} className="text-green-600 hover:text-green-700 disabled:opacity-50" aria-label="Salvează numele">
                  <Check className="w-4 h-4" aria-hidden />
                </button>
                <button onClick={() => setRenaming(null)} className="text-gray-400 hover:text-gray-600" aria-label="Renunță">
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <LayoutGrid className="w-4 h-4 text-[#c84b1e] flex-shrink-0" aria-hidden />
                <h4 className="font-semibold text-gray-900 flex-1 truncate">{b.label}</h4>
                <span className="text-xs text-gray-400">{b.tables.length} {b.tables.length === 1 ? "masă" : "mese"}</span>
                {b.section && (
                  <>
                    <button
                      onClick={() => setRenaming({ kind: "section", id: b.id, value: b.label })}
                      className="text-gray-300 hover:text-gray-600"
                      aria-label={`Redenumește secțiunea ${b.label}`}
                    >
                      <Pencil className="w-4 h-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => deleteSection(b.section!)}
                      disabled={busy}
                      className="text-gray-300 hover:text-red-600 disabled:opacity-50"
                      aria-label={`Șterge secțiunea ${b.label}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {b.tables.length > 0 && (
            <ul className="divide-y divide-gray-100 mb-3">
              {b.tables.map((t) => (
                <li key={t.id} className={`py-2 flex items-center gap-2 ${t.isActive ? "" : "opacity-50"}`}>
                  {renaming?.kind === "table" && renaming.id === t.id ? (
                    <>
                      <input
                        value={renaming.value}
                        onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(null); }}
                        maxLength={60}
                        autoFocus
                        className={`${fieldClass} flex-1`}
                      />
                      <button onClick={saveRename} disabled={busy} className="text-green-600 hover:text-green-700 disabled:opacity-50" aria-label="Salvează numele">
                        <Check className="w-4 h-4" aria-hidden />
                      </button>
                      <button onClick={() => setRenaming(null)} className="text-gray-400 hover:text-gray-600" aria-label="Renunță">
                        <X className="w-4 h-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900 flex-1 truncate">{t.label}</span>
                      {!t.isActive && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">scoasă din uz</span>
                      )}
                      {/* Moving a table between sections is the common edit once the room
                          is drawn, so it's a plain select rather than a hidden dialog. */}
                      {initialSections.length > 0 && (
                        <label className="inline-flex items-center gap-1 text-xs">
                          <span className="sr-only">Secțiunea mesei {t.label}</span>
                          <select
                            value={t.sectionId ?? ""}
                            onChange={(e) => call(`${tablesBase}?tableId=${t.id}`, "PATCH", { sectionId: e.target.value || null })}
                            disabled={busy}
                            className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white disabled:opacity-50"
                          >
                            <option value="">Fără secțiune</option>
                            {initialSections.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button
                        onClick={() => setRenaming({ kind: "table", id: t.id, value: t.label })}
                        className="text-gray-300 hover:text-gray-600"
                        aria-label={`Redenumește masa ${t.label}`}
                      >
                        <Pencil className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        onClick={() => call(`${tablesBase}?tableId=${t.id}`, "PATCH", { isActive: !t.isActive })}
                        disabled={busy}
                        title={t.isActive ? "Nu mai apare când alegi masa unei rezervări. Rezervările deja atribuite rămân pe ea." : "Fă masa disponibilă din nou."}
                        className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                      >
                        {t.isActive ? "Scoate din uz" : "Repune în uz"}
                      </button>
                      <button
                        onClick={() => deleteTable(t)}
                        disabled={busy}
                        className="text-gray-300 hover:text-red-600 disabled:opacity-50"
                        aria-label={`Șterge masa ${t.label}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2 border-t border-gray-100 pt-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Nume masă
              <input
                value={drafts[b.id] ?? ""}
                onChange={(e) => setDrafts((s) => ({ ...s, [b.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addTable(b.id); }}
                maxLength={60}
                placeholder="m1"
                className={`${fieldClass} w-28`}
              />
            </label>
            <button
              onClick={() => addTable(b.id)}
              disabled={busy}
              className="inline-flex items-center gap-1 bg-[#1a1a1a] text-white text-sm h-[38px] px-3 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" aria-hidden /> Adaugă masă
            </button>
          </div>
        </div>
      ))}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h4 className="font-semibold text-gray-900 mb-1">Adaugă o secțiune</h4>
        <p className="text-sm text-gray-500 mb-3">
          O secțiune e o parte din local, numită cum vrei tu: „Sala 1”, „Terasă”, „Etaj”.
        </p>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            Nume secțiune
            <input
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSection(); }}
              maxLength={60}
              placeholder="Sala 1"
              className={`${fieldClass} w-40`}
            />
          </label>
          <button
            onClick={addSection}
            disabled={busy}
            className="inline-flex items-center gap-1 bg-[#1a1a1a] text-white text-sm h-[38px] px-3 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden /> Adaugă secțiune
          </button>
        </div>
      </div>

      {/* Deleting a table that bookings are pinned to. The bookings themselves survive
          untouched — only the note of where those guests were going to sit is lost. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg">Ștergi masa „{confirmDelete.table.label}”?</h3>
            <p className="text-sm text-gray-600 mt-2">
              {confirmDelete.affected === 1 ? "O rezervare viitoare este" : `${confirmDelete.affected} rezervări viitoare sunt`} atribuite acestei mese.
              Rezervările rămân neschimbate — doar rămân fără masă atribuită, și le poți alege alta oricând.
            </p>
            {confirmDelete.bookings.length > 0 && (
              <ul className="mt-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
                {confirmDelete.bookings.map((b, i) => (
                  <li key={i}>{b.date} · {b.time} — {b.guestName} ({b.partySize} pers.)</li>
                ))}
              </ul>
            )}
            <p className="text-sm text-gray-600 mt-3">
              Dacă masa e scoasă din uz doar temporar, <strong>scoate-o din uz</strong> — rezervările
              rămân pe ea și nu o mai poți atribui altcuiva.
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={async () => {
                  const t = confirmDelete.table;
                  setConfirmDelete(null);
                  if (await call(`${tablesBase}?tableId=${t.id}`, "PATCH", { isActive: false })) {
                    setNotice(`Masa „${t.label}” a fost scoasă din uz. Rezervările existente rămân pe ea.`);
                  }
                }}
                disabled={busy}
                className="w-full bg-[#1a1a1a] text-white font-semibold py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-60"
              >
                Scoate din uz (recomandat)
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
