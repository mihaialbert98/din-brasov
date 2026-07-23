"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import type { ResTableRow } from "@/components/restaurant/ReservationTablesManager";

export interface GroupRow {
  id: string;
  label: string;
  tableIds: string[];
}

/**
 * Manage join-GROUPS (tables-capacity mode): which tables can physically be pushed
 * together. Tables in a group combine only among themselves (up to the whole group);
 * a table may belong to several groups. Ungrouped "se poate uni" tables keep the
 * global "Mese maxime unite" cap. See canSeat() in lib/reservations.ts.
 */
export default function ReservationTableGroupsManager({
  restaurantId,
  tables,
  initialGroups,
}: {
  restaurantId: string;
  tables: ResTableRow[];
  initialGroups: GroupRow[];
}) {
  const router = useRouter();
  const base = `/api/restaurants/${restaurantId}/reservation-table-groups`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newSel, setNewSel] = useState<Set<string>>(new Set());

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSel, setEditSel] = useState<Set<string>>(new Set());

  // Master switch: only tables marked "se poate uni" can be grouped.
  const joinableTables = tables.filter((t) => t.isActive && t.joinable);
  const labelOf = (id: string) => tables.find((t) => t.id === id)?.label ?? "?";

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

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSet(n);
  }

  async function createGroup() {
    if (!newLabel.trim()) { setError("Dă un nume grupului (ex: Masa 1–2)."); return; }
    if (newSel.size < 2) { setError("Un grup are cel puțin 2 mese."); return; }
    const ok = await call(base, "POST", { label: newLabel.trim(), tableIds: [...newSel] });
    if (ok) { setNewLabel(""); setNewSel(new Set()); }
  }

  function startEdit(g: GroupRow) {
    setEditId(g.id); setEditLabel(g.label); setEditSel(new Set(g.tableIds)); setError(null);
  }
  async function saveEdit() {
    if (!editId) return;
    if (!editLabel.trim()) { setError("Numele grupului e obligatoriu."); return; }
    if (editSel.size < 2) { setError("Un grup are cel puțin 2 mese."); return; }
    const ok = await call(`${base}?groupId=${editId}`, "PATCH", { label: editLabel.trim(), tableIds: [...editSel] });
    if (ok) setEditId(null);
  }

  const fieldClass = "border border-gray-300 rounded-lg px-3 h-[38px] text-sm focus:outline-none focus:border-[#c84b1e]";
  const chip = (checked: boolean) =>
    `inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${checked ? "border-[#c84b1e] bg-[#c84b1e]/5 text-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-semibold text-gray-900">Grupuri de mese (care se pot uni)</h3>
        <span className="text-xs text-gray-400">{initialGroups.length} grupuri</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Grupurile spun ce mese se pot alătura fizic. Poți grupa doar mesele bifate „se poate uni". Mesele dintr-un
        grup se unesc între ele (până la tot grupul), iar o masă poate fi în mai multe grupuri. Mesele „se pot uni"
        care nu sunt în niciun grup se combină între ele până la limita „Mese maxime unite". Fără grupuri, se aplică
        doar acea limită globală.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {joinableTables.length < 2 ? (
        <p className="text-sm text-gray-400">Bifează „se poate uni" la cel puțin 2 mese (mai sus) ca să poți crea un grup.</p>
      ) : (
        <>
          {initialGroups.length > 0 && (
            <ul className="divide-y divide-gray-100 mb-4">
              {initialGroups.map((g) => (
                <li key={g.id} className="py-3">
                  {editId === g.id ? (
                    <div className="space-y-2">
                      <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={60} className={`${fieldClass} w-full`} />
                      <div className="flex flex-wrap gap-2">
                        {joinableTables.map((t) => (
                          <label key={t.id} className={chip(editSel.has(t.id))}>
                            <input type="checkbox" checked={editSel.has(t.id)} onChange={() => toggle(editSel, setEditSel, t.id)} className="accent-[#c84b1e]" />
                            {t.label} <span className="text-xs opacity-60">({t.seats})</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit} disabled={busy} className="inline-flex items-center gap-1 bg-[#c84b1e] text-white text-sm h-8 px-3 rounded-lg hover:bg-[#d9603a] disabled:opacity-50"><Check className="w-4 h-4" aria-hidden /> Salvează</button>
                        <button onClick={() => setEditId(null)} disabled={busy} className="inline-flex items-center gap-1 border border-gray-300 text-gray-600 text-sm h-8 px-3 rounded-lg hover:bg-gray-50"><X className="w-4 h-4" aria-hidden /> Anulează</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{g.label}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {g.tableIds.map((id) => (
                            <span key={id} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{labelOf(id)}</span>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => startEdit(g)} disabled={busy} className="text-gray-400 hover:text-gray-700 disabled:opacity-50" aria-label="Editează grupul"><Pencil className="w-4 h-4" aria-hidden /></button>
                      <button onClick={() => { if (confirm(`Ștergi grupul „${g.label}"?`)) call(`${base}?groupId=${g.id}`, "DELETE"); }} disabled={busy} className="text-gray-300 hover:text-red-600 disabled:opacity-50" aria-label="Șterge grupul"><Trash2 className="w-4 h-4" aria-hidden /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Create group */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={60} placeholder="Nume grup (ex: Masa 1–2)" className={`${fieldClass} w-full`} />
            <div className="flex flex-wrap gap-2">
              {joinableTables.map((t) => (
                <label key={t.id} className={chip(newSel.has(t.id))}>
                  <input type="checkbox" checked={newSel.has(t.id)} onChange={() => toggle(newSel, setNewSel, t.id)} className="accent-[#c84b1e]" />
                  {t.label} <span className="text-xs opacity-60">({t.seats})</span>
                </label>
              ))}
            </div>
            <button onClick={createGroup} disabled={busy} className="inline-flex items-center gap-1 bg-[#1a1a1a] text-white text-sm h-[38px] px-3 rounded-lg hover:bg-gray-700 disabled:opacity-50">
              <Plus className="w-4 h-4" aria-hidden /> Adaugă grup
            </button>
          </div>
        </>
      )}
    </div>
  );
}
