"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Corner delete button for a pending draft card. The card itself is a <Link>,
 * so every handler stops propagation + prevents default to avoid navigating
 * to the review page when the user means to delete.
 */
export default function DraftDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDelete(e: React.MouseEvent) {
    stop(e);
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/news/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Eroare");
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div
        onClick={stop}
        className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 p-1"
      >
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "..." : "Șterge"}
        </button>
        <button
          onClick={(e) => { stop(e); setConfirming(false); setError(null); }}
          disabled={isPending}
          className="text-gray-500 text-xs font-semibold px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          Nu
        </button>
        {error && <span className="text-[10px] text-red-600 px-1">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { stop(e); setConfirming(true); }}
      aria-label={`Șterge „${title}"`}
      title="Șterge"
      className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center bg-white/90 text-red-600 rounded-full shadow-sm hover:bg-red-600 hover:text-white transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}
