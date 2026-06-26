"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import DraftDeleteButton from "@/components/admin/DraftDeleteButton";

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
}: {
  drafts: DraftCard[];
  draftPage: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allIds = drafts.map((d) => d.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  // Counts to show how many each mode will publish (client-side hint; the server
  // re-resolves authoritatively).
  const nonDupCount = drafts.filter((d) => !d.isDuplicate).length;
  const newCount = drafts.filter((d) => d.isNewBatch && !d.isDuplicate).length;
  const dupCount = drafts.filter((d) => d.isDuplicate).length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function modeCount(mode: Mode): number {
    switch (mode) {
      case "all":
      case "non_overlap":
        return nonDupCount;
      case "new":
        return newCount;
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
        setSelected(new Set());
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
          Publicare în masă (fără revizuire individuală)
        </span>
        <button
          onClick={() => { setConfirmMode("all"); setError(null); }}
          disabled={nonDupCount === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.all} ({nonDupCount})
        </button>
        <button
          onClick={() => { setConfirmMode("new"); setError(null); }}
          disabled={newCount === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.new} ({newCount})
        </button>
        <button
          onClick={() => { setConfirmMode("non_overlap"); setError(null); }}
          disabled={nonDupCount === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.non_overlap} ({nonDupCount})
        </button>
        <button
          onClick={() => { setConfirmMode("selected"); setError(null); }}
          disabled={selected.size === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {MODE_LABELS.selected} ({selected.size})
        </button>
      </div>

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
