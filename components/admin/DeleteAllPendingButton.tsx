"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAllPendingButton({ count }: { count: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  function handleDelete() {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/news/delete-pending", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Eroare la ștergere.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600">
          Sigur ștergi toate cele {count} știri în așteptare?
        </span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="bg-red-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "Se șterge..." : "Da, șterge tot"}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(null); }}
          disabled={isPending}
          className="border border-gray-200 text-gray-700 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Anulează
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
    >
      Șterge toate ({count})
    </button>
  );
}
