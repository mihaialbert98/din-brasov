"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";

/**
 * Admin action on a directory-only local: create its restaurant capability layer
 * (menu + reservations), then deep-link to the restaurant dashboard to finish setup.
 */
export default function EnableRestaurantButton({ placeId }: { placeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("Activezi meniu și rezervări pentru acest local? Se creează panoul de restaurant.")) return;
    setLoading(true);
    const res = await fetch(`/api/admin/places/${placeId}/enable-restaurant`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      // Take the admin to the new dashboard to finish setup (owner, tables, hours).
      if (data.slug) router.push(`/restaurant/${data.slug}`);
      else router.refresh();
    } else {
      alert("Eroare la activarea restaurantului.");
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs font-semibold px-3 h-11 rounded-lg border border-[#c84b1e] text-[#c84b1e] hover:bg-[#c84b1e]/10 inline-flex items-center gap-1 disabled:opacity-50"
      title="Creează meniu și rezervări pentru acest local"
    >
      <Store className="w-3.5 h-3.5" aria-hidden /> {loading ? "..." : "Activează meniu/rezervări"}
    </button>
  );
}
