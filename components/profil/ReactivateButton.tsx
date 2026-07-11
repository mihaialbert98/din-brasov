"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReactivateButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReactivate() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/reactivate`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la reactivare.");
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        onClick={handleReactivate}
        disabled={loading}
        className="text-sm px-3 py-1.5 bg-[#c84b1e] text-white rounded-lg font-medium hover:bg-[#d9603a] transition-colors disabled:opacity-60"
      >
        {loading ? "Se reactivează..." : "Reactivează"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
