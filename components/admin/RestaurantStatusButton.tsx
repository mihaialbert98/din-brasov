"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RestaurantStatusButton({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const next = status === "active" ? "suspended" : "active";

  async function handleClick() {
    if (
      next === "suspended" &&
      !confirm("Suspendă acest restaurant? Meniul și butoanele pentru clienți vor fi indisponibile.")
    )
      return;
    setLoading(true);
    const res = await fetch(`/api/admin/restaurants/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
    else alert("Eroare la actualizarea stării.");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
        status === "active"
          ? "border border-gray-300 text-gray-600 hover:bg-gray-50"
          : "bg-[#c84b1e] text-white hover:bg-[#d9603a]"
      }`}
    >
      {loading ? "..." : status === "active" ? "Suspendă" : "Reactivează"}
    </button>
  );
}
