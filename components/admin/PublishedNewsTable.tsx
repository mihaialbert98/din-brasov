"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { NewsItem } from "@/lib/db/schema";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface Props {
  items: NewsItem[];
  hasOldItems: boolean;
}

type ConfirmMode = "single" | "bulk" | "old" | null;

function isOldItem(item: NewsItem): boolean {
  return item.publishedAt != null &&
    new Date(item.publishedAt).getTime() < Date.now() - THIRTY_DAYS_MS;
}

export default function PublishedNewsTable({ items, hasOldItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const allIds = items.map((i) => i.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function openSingleDelete(id: string) {
    setDeleteTarget(id);
    setConfirmMode("single");
    setError(null);
  }

  function cancel() {
    setConfirmMode(null);
    setDeleteTarget(null);
    setError(null);
  }

  function handleConfirm() {
    startTransition(async () => {
      setError(null);
      try {
        if (confirmMode === "single" && deleteTarget) {
          const res = await fetch(`/api/news/${deleteTarget}`, { method: "DELETE" });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error); }
          setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget); return n; });
        } else if (confirmMode === "bulk") {
          const res = await fetch("/api/news/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: Array.from(selected) }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error); }
          setSelected(new Set());
        } else if (confirmMode === "old") {
          const res = await fetch("/api/news/delete-old", { method: "POST" });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error); }
          setSelected(new Set());
        }
        setConfirmMode(null);
        setDeleteTarget(null);
        router.refresh();
      } catch (err: any) {
        setError(err?.message ?? "Eroare la ștergere.");
      }
    });
  }

  const confirmTitle =
    confirmMode === "single" ? "Ștergi această știre?" :
    confirmMode === "bulk" ? `Ștergi ${selected.size} ${selected.size === 1 ? "știre" : "știri"}?` :
    "Ștergi toate articolele mai vechi de 30 zile?";

  const confirmDesc =
    confirmMode === "old"
      ? "Această acțiune este ireversibilă. Toate articolele publicate mai vechi de 30 de zile vor fi șterse permanent, inclusiv imaginile."
      : "Această acțiune este ireversibilă. Articolele și imaginile lor vor fi șterse permanent din baza de date.";

  return (
    <>
      {/* Delete old button */}
      {hasOldItems && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => { setConfirmMode("old"); setError(null); }}
            className="text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Șterge articole mai vechi de 30 zile
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-amber-800">
            {selected.size} {selected.size === 1 ? "articol selectat" : "articole selectate"}
          </span>
          <button
            onClick={() => { setConfirmMode("bulk"); setError(null); }}
            className="bg-red-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
          >
            Șterge selecția ({selected.size})
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 w-10">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-[#c84b1e]"
                  aria-label={allSelected ? "Deselectează tot" : "Selectează tot"}
                />
              </th>
              <th className="text-left p-3 font-semibold text-gray-600">Titlu</th>
              <th className="text-left p-3 font-semibold text-gray-600 hidden sm:table-cell">Sursă</th>
              <th className="text-left p-3 font-semibold text-gray-600 hidden md:table-cell">Categorie</th>
              <th className="text-left p-3 font-semibold text-gray-600 hidden sm:table-cell">Data</th>
              <th className="p-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const old = isOldItem(item);
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${old ? "bg-amber-50/40" : ""}`}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                      className="w-4 h-4 accent-[#c84b1e]"
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <Link
                        href={`/stiri/${item.slug}`}
                        target="_blank"
                        className="font-medium hover:underline text-gray-900 line-clamp-2"
                      >
                        {item.title}
                      </Link>
                      {old && (
                        <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                          Vechi
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-gray-500 hidden sm:table-cell">{item.sourceName}</td>
                  <td className="p-3 text-gray-500 hidden md:table-cell">{item.category ?? "—"}</td>
                  <td className="p-3 text-gray-400 hidden sm:table-cell">
                    {item.publishedAt
                      ? formatDate(item.publishedAt, { day: "numeric", month: "short" })
                      : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/admin/stiri/${item.id}`}
                        className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded-md transition-colors"
                      >
                        Editează
                      </Link>
                      <button
                        onClick={() => openSingleDelete(item.id)}
                        className="text-xs text-red-600 hover:text-red-800 border border-red-200 px-2 py-1 rounded-md transition-colors"
                      >
                        Șterge
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmMode && (
        <ConfirmModal
          title={confirmTitle}
          description={confirmDesc}
          loading={isPending}
          error={error}
          onConfirm={handleConfirm}
          onCancel={cancel}
        />
      )}
    </>
  );
}
