"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteOwnListingButton({ listingId, title }: { listingId: string; title: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la ștergere.");
      setConfirm(false);
    }
  }

  if (confirm) {
    return (
      <span className="flex flex-col items-start gap-1">
        <span className="text-xs text-gray-600">Ești sigur?</span>
        <span className="flex gap-2">
          <button
            onClick={() => setConfirm(false)}
            disabled={loading}
            className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Anulează
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="text-xs px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? "Se șterge..." : "Șterge"}
          </button>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      title={`Șterge „${title}"`}
      className="text-sm px-3 py-1.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
    >
      Șterge
    </button>
  );
}
