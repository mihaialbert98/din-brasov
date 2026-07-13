"use client";

import { useState } from "react";
import ServiceBoard from "@/components/restaurant/ServiceBoard";
import ReservationsBoard from "@/components/restaurant/ReservationsBoard";

/**
 * Tabbed staff surface: the live service queue and (when the restaurant takes
 * reservations) the upcoming-reservations board. `showReservations` gates the tab.
 */
export default function StaffBoardTabs({
  basePath,
  showReservations,
}: {
  basePath: string;
  showReservations: boolean;
}) {
  const [tab, setTab] = useState<"serviciu" | "rezervari">("serviciu");

  if (!showReservations) {
    return <ServiceBoard basePath={basePath} />;
  }

  return (
    <div>
      <div className="flex gap-1 mb-5">
        {([
          { k: "serviciu", label: "Serviciu" },
          { k: "rezervari", label: "Rezervări" },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.k ? "bg-[#1a1a1a] text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "serviciu" ? <ServiceBoard basePath={basePath} /> : <ReservationsBoard basePath={basePath} />}
    </div>
  );
}
