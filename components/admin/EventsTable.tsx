"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { Event } from "@/lib/db/schema";

interface Props {
  items: Event[];
}

type ConfirmState =
  | { type: "single"; id: string; title: string }
  | { type: "bulk"; ids: string[] }
  | null;

export default function EventsTable({ items }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = items.length > 0 && selected.size === items.length;
  const someChecked = selected.size > 0 && selected.size < items.length;

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function execDelete(ids: string[]) {
    setLoading(true);
    setError(null);
    try {
      const res = ids.length === 1
        ? await fetch(`/api/events/${ids[0]}`, { method: "DELETE" })
        : await fetch("/api/events/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
      if (!res.ok) throw new Error();
      setSelected(new Set());
      setConfirm(null);
      router.refresh();
    } catch {
      setError("Eroare la ștergere. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {confirm && (
        <ConfirmModal
          description={
            confirm.type === "single"
              ? <>Ești sigur că vrei să ștergi <span className="font-semibold">„{confirm.title}"</span>? Acțiunea este ireversibilă.</>
              : <>Ești sigur că vrei să ștergi <span className="font-semibold">{confirm.ids.length} evenimente</span>? Acțiunea este ireversibilă.</>
          }
          loading={loading}
          error={error}
          onConfirm={() => execDelete(confirm.type === "single" ? [confirm.id] : confirm.ids)}
          onCancel={() => { setConfirm(null); setError(null); }}
        />
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-[#1a1a1a] text-white rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{selected.size} selectate</span>
          <button
            onClick={() => setConfirm({ type: "bulk", ids: Array.from(selected) })}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            Șterge selectate
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-[#c84b1e]"
                />
              </th>
              <th className="text-left p-3 font-semibold text-gray-600">Titlu</th>
              <th className="text-left p-3 font-semibold text-gray-600">Data</th>
              <th className="text-left p-3 font-semibold text-gray-600">Locație</th>
              <th className="text-left p-3 font-semibold text-gray-600">Categorie</th>
              <th className="p-3 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((ev) => (
              <tr key={ev.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(ev.id)}
                    onChange={() => toggleOne(ev.id)}
                    className="w-4 h-4 accent-[#c84b1e]"
                  />
                </td>
                <td className="p-3">
                  <Link href={`/evenimente/${ev.slug}`} target="_blank" className="font-medium hover:underline text-gray-900">
                    {ev.title}
                  </Link>
                </td>
                <td className="p-3 text-gray-500 whitespace-nowrap">
                  {ev.startsAt ? formatDate(ev.startsAt, { day: "numeric", month: "short" }) : "—"}
                </td>
                <td className="p-3 text-gray-500">{ev.locationName ?? "—"}</td>
                <td className="p-3 text-gray-500">{ev.category ?? "—"}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2 justify-end">
                    <Link
                      href={`/admin/evenimente/${ev.id}`}
                      className="text-xs text-gray-600 border border-gray-300 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                    >
                      Editează
                    </Link>
                    <button
                      onClick={() => setConfirm({ type: "single", id: ev.id, title: ev.title })}
                      className="text-xs text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
