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
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <Heart size={16} className="text-accent" fill="currentColor" />
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
      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-hairline text-sm font-medium text-ink/70 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
    >
      <Heart
        size={16}
        className={saved ? "text-accent" : "text-faint"}
        fill={saved ? "currentColor" : "none"}
      />
      {saved ? "Salvat" : "Salvează"}
    </button>
  );
}
