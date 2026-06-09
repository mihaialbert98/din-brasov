"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function NewsDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/news/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Eroare la ștergere.");
        return;
      }
      router.push("/admin/stiri");
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Ești sigur?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "Se șterge..." : "Da, șterge"}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(null); }}
          disabled={isPending}
          className="border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Anulează
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="bg-red-100 text-red-700 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-red-200 transition-colors"
    >
      Șterge
    </button>
  );
}
