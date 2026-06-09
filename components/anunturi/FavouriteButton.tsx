"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

type Props = {
  listingId: string;
  favouriteCount?: number;
  isOwner?: boolean;
};

export default function FavouriteButton({ listingId, favouriteCount, isOwner }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/listings/${listingId}/favourite`)
      .then((r) => {
        if (r.status === 401) return { saved: false };
        return r.json();
      })
      .then((d) => setSaved(d.saved ?? false))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [listingId]);

  // Owner sees their favourite count, not a toggle
  if (isOwner) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-gray-500">
        <Heart size={16} className="text-[#c84b1e]" fill="#c84b1e" />
        {favouriteCount ?? 0} {(favouriteCount ?? 0) === 1 ? "salvare" : "salvări"}
      </span>
    );
  }

  async function handleToggle() {
    setLoading(true);
    const method = saved ? "DELETE" : "POST";
    const res = await fetch(`/api/listings/${listingId}/favourite`, { method });
    setLoading(false);
    if (res.status === 401) {
      router.push("/intra");
      return;
    }
    if (res.ok) {
      setSaved(!saved);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={saved ? "Elimină din favorite" : "Salvează la favorite"}
      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:border-[#c84b1e] hover:text-[#c84b1e] transition-colors disabled:opacity-50"
    >
      <Heart
        size={16}
        className={saved ? "text-[#c84b1e]" : "text-gray-400"}
        fill={saved ? "#c84b1e" : "none"}
      />
      {saved ? "Salvat" : "Salvează"}
    </button>
  );
}
