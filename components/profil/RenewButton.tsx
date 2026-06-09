"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RenewButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRenew() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/renew`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la reînnoire.");
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        onClick={handleRenew}
        disabled={loading}
        className="text-sm px-3 py-1.5 bg-[#c84b1e] text-white rounded-lg font-medium hover:bg-[#d9603a] transition-colors disabled:opacity-60"
      >
        {loading ? "Se reînnoiește..." : "Reînnoiește"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
