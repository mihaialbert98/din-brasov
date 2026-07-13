"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Admin toggle granting a restaurant the reservations capability. */
export default function ReservationsGrantButton({
  id,
  granted,
}: {
  id: string;
  granted: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch(`/api/admin/restaurants/${id}/reservations-grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ granted: !granted }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
    else alert("Eroare la actualizarea permisiunii.");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
        granted
          ? "bg-green-600 text-white hover:bg-green-700"
          : "border border-gray-300 text-gray-600 hover:bg-gray-50"
      }`}
      title="Permite acestui restaurant să primească rezervări"
    >
      {loading ? "..." : granted ? "Rezervări: ON" : "Rezervări: OFF"}
    </button>
  );
}
