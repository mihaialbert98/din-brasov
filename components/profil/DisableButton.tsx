"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisableButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisable() {
    if (!confirm("Dezactivezi acest anunț? Nu va mai fi vizibil public, dar îl poți reactiva oricând.")) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/disable`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la dezactivare.");
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        onClick={handleDisable}
        disabled={loading}
        className="text-sm px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        {loading ? "Se dezactivează..." : "Dezactivează"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
