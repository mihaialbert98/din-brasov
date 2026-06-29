"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import DraftDeleteButton from "@/components/admin/DraftDeleteButton";

// Selection must survive page navigation (each ?dp= change is a full server
// re-render that remounts this component). We persist the checked ids in
// sessionStorage so cherry-picking works across pages; cleared after a publish.
const SELECTION_KEY = "admin-draft-selection";

function loadSelection(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSelection(ids: Set<string>) {
  try {
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

export interface DraftCard {
  id: string;
  title: string;
  excerpt: string;
  sourceName: string;
  category: string | null;
  imageUrl: string | null;
  daysUntilExpiry: number;
  isDuplicate: boolean;
  isNewBatch: boolean; // scraped in the latest batch
}

type Mode = "all" | "new" | "non_overlap" | "selected";

const MODE_LABELS: Record<Mode, string> = {
  all: "Publică toate",
  new: "Publică doar cele noi",
  non_overlap: "Publică fără dubluri",
  selected: "Publică selecția",
};

export default function DraftReviewGrid({
  drafts,
  draftPage,
  totalNonDup,
  totalNew,
  totalDup,
}: {
  drafts: DraftCard[];
  draftPage: number;
  totalNonDup: number; // non-duplicate drafts across ALL pages
  totalNew: number; // newly-scraped non-duplicate drafts across ALL pages
  totalDup: number; // duplicate drafts across ALL pages
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Hydrate from sessionStorage so checks persist across page navigation.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(loadSelection());
  }, []);

  function updateSelection(next: Set<string>) {
    setSelected(next);
    saveSelection(next);
  }

  // The "all/new/non_overlap" modes act on EVERY pending draft server-side, so
  // their counts are the cross-page totals, not the current page's.
  const dupCount = totalDup;

  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    updateSelection(next);
  }

  function clearSelection() {
    updateSelection(new Set());
  }

  function modeCount(mode: Mode): number {
    switch (mode) {
      case "all":
      case "non_overlap":
        return totalNonDup;
      case "new":
        return totalNew;
      case "selected":
        return selected.size;
    }
  }

  function handleConfirm() {
    if (!confirmMode) return;
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/news/bulk-publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: confirmMode,
            ids: confirmMode === "selected" ? Array.from(selected) : undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Eroare la publicare.");
        }
        updateSelection(new Set());
        setConfirmMode(null);
        router.refresh();
      } catch (err: any) {
        setError(err?.message ?? "Eroare la publicare.");
      }
    });
  }

  const confirmCount = confirmMode ? modeCount(confirmMode) : 0;

  return (
    <>
      {/* Bulk action bar */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-amber-800 mr-auto">
          Publicare în masă (din toate paginile, fără revizuire individuală)
        </span>
        <button
          onClick={() => { setConfirmMode("all"); setError(null); }}
          disabled={totalNonDup === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.all} ({totalNonDup})
        </button>
        <button
          onClick={() => { setConfirmMode("new"); setError(null); }}
          disabled={totalNew === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.new} ({totalNew})
        </button>
        <button
          onClick={() => { setConfirmMode("non_overlap"); setError(null); }}
          disabled={totalNonDup === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.non_overlap} ({totalNonDup})
        </button>
        <button
          onClick={() => { setConfirmMode("selected"); setError(null); }}
          disabled={selected.size === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.selected} ({selected.size})
        </button>
      </div>

      {/* Cross-page selection indicator */}
      {selected.size > 0 && (
        <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
          <span>
            {selected.size} {selected.size === 1 ? "știre selectată" : "știri selectate"} (pe toate paginile)
          </span>
          <button onClick={clearSelection} className="text-[#c84b1e] font-medium hover:underline">
            Deselectează tot
          </button>
        </div>
      )}

      {/* Draft cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {drafts.map((item) => (
          <div
            key={item.id}
            className="relative bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
          >
            {/* Selection checkbox */}
            <label
              className="absolute top-2 left-2 z-20 bg-white/90 rounded p-1 cursor-pointer shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleOne(item.id)}
                className="w-4 h-4 accent-[#c84b1e] block"
                aria-label={`Selectează „${item.title}"`}
              />
            </label>

            {/* Badges (below the checkbox) */}
            <div className="absolute top-11 left-2 z-10 flex flex-col gap-1 items-start">
              <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                Nou
              </span>
              {item.isDuplicate && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  Duplicat
                </span>
              )}
            </div>

            <DraftDeleteButton id={item.id} title={item.title} />

            <Link href={`/admin/stiri/${item.id}?dp=${draftPage}`} className="flex flex-col flex-1">
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#c84b1e] uppercase">{item.sourceName}</span>
                  {item.category && <span className="text-xs text-gray-400">· {item.category}</span>}
                </div>
                <h2 className="font-semibold text-gray-900 text-sm line-clamp-3">{item.title}</h2>
                <p className="text-xs text-gray-500 line-clamp-2">{item.excerpt}</p>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className={`text-xs font-medium ${item.daysUntilExpiry <= 1 ? "text-red-500" : "text-gray-400"}`}>
                    Expiră în {item.daysUntilExpiry} {item.daysUntilExpiry === 1 ? "zi" : "zile"}
                  </span>
                  <span className="text-xs text-[#c84b1e] font-medium">Revizuiește →</span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {confirmMode && (
        <ConfirmModal
          title={`Publici ${confirmCount} ${confirmCount === 1 ? "știre" : "știri"}?`}
          description={
            <>
              Aceste anunțuri <strong>NU au fost revizuite individual</strong>.
              {(confirmMode === "all" || confirmMode === "new" || confirmMode === "non_overlap") && dupCount > 0 && (
                <> Cele {dupCount} marcate ca „Duplicat" vor fi omise.</>
              )}
              {" "}Continui?
            </>
          }
          confirmLabel="Publică"
          loading={isPending}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => { setConfirmMode(null); setError(null); }}
        />
      )}
    </>
  );
}
