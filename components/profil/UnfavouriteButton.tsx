"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnfavouriteButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    await fetch(`/api/listings/${listingId}/favourite`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
    >
      {loading ? "..." : "Elimină"}
    </button>
  );
}
