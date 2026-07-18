"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";

/** Inline editable private note about a client (owner-only). */
export default function ClientNote({
  restaurantId,
  userId,
  initialNote,
}: {
  restaurantId: string;
  userId: string;
  initialNote: string;
}) {
  const [note, setNote] = useState(initialNote);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/restaurants/${restaurantId}/clients/${userId}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left w-full group"
      >
        {note ? (
          <span className="text-sm text-gray-600 italic">„{note}"<Pencil className="inline w-3 h-3 ml-1 text-gray-300 group-hover:text-gray-500" aria-hidden /></span>
        ) : (
          <span className="text-sm text-gray-400 inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" aria-hidden /> Adaugă o notiță {saved && <Check className="w-3.5 h-3.5 text-green-600" aria-hidden />}</span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        autoFocus
        placeholder="Ex: preferă masa la geam, alergic la nuci…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]"
      />
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-white hover:bg-gray-700 disabled:opacity-60">
          {saving ? "Se salvează…" : "Salvează"}
        </button>
        <button onClick={() => { setEditing(false); setNote(initialNote); }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
          Anulează
        </button>
      </div>
    </div>
  );
}
