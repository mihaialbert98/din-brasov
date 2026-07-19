"use client";

import { useCallback, useRef, useState } from "react";
import ServiceBoard from "@/components/restaurant/ServiceBoard";
import ReservationsBoard from "@/components/restaurant/ReservationsBoard";
import { useVisiblePoll } from "@/lib/useVisiblePoll";
import { notify } from "@/lib/chime";

/**
 * Tabbed staff surface: the live service queue and (when the restaurant takes
 * reservations) the upcoming-reservations board. `showReservations` gates the tab.
 *
 * Only ONE board is mounted at a time, so this parent also polls the OTHER tab's
 * count in the background — that keeps its badge fresh AND lets a new reservation
 * chime/notify even while the waiter is on the Serviciu tab (and vice-versa). The
 * mounted board reports its own live count up via onCount (so the badge is exact
 * right after an "Am preluat"/confirm, with no stale lag).
 */
export default function StaffBoardTabs({
  basePath,
  showReservations,
}: {
  basePath: string;
  showReservations: boolean;
}) {
  const [tab, setTab] = useState<"serviciu" | "rezervari">("serviciu");
  const [serviceCount, setServiceCount] = useState(0);
  const [reservationCount, setReservationCount] = useState(0);
  // Track pending-reservation count seen by the BACKGROUND poller so we only chime
  // on a genuine increase (not on first load or while the board itself is mounted).
  const bgPrevReservations = useRef<number | null>(null);
  const bgPrevService = useRef<number | null>(null);

  // Poll whichever board is NOT currently mounted, so its badge stays live and a
  // new item there still alerts. The mounted board handles its own polling + chime.
  const pollBackground = useCallback(async () => {
    if (!showReservations) return;
    try {
      if (tab === "serviciu") {
        // Reservations board is not mounted → poll its pending count + chime on rise.
        const res = await fetch(`${basePath}/reservations`, { cache: "no-store" });
        if (!res.ok) return;
        const { data } = await res.json();
        const pending = Array.isArray(data) ? data.filter((r: { status: string }) => r.status === "pending").length : 0;
        setReservationCount(pending);
        if (bgPrevReservations.current !== null && pending > bgPrevReservations.current) {
          notify({ title: "Rezervare nouă", body: "Ai o cerere de rezervare nouă." });
        }
        bgPrevReservations.current = pending;
      } else {
        // Service board is not mounted → poll its open count + chime on rise.
        const res = await fetch(`${basePath}/requests?status=pending`, { cache: "no-store" });
        if (!res.ok) return;
        const { data } = await res.json();
        const open = Array.isArray(data) ? data.length : 0;
        setServiceCount(open);
        if (bgPrevService.current !== null && open > bgPrevService.current) {
          notify({ title: "Cerere nouă la masă", body: "Ai o cerere de serviciu nouă." });
        }
        bgPrevService.current = open;
      }
    } catch {
      /* retry next tick */
    }
  }, [basePath, tab, showReservations]);

  // Background poll: service is time-sensitive (8s), reservations less so (20s).
  useVisiblePoll(pollBackground, tab === "serviciu" ? 20000 : 8000, 30000);

  // When switching tabs, reset the background baseline for the now-inactive board so
  // we don't fire a spurious chime from a stale prev value on the next poll.
  function switchTo(next: "serviciu" | "rezervari") {
    if (next === "serviciu") bgPrevReservations.current = null;
    else bgPrevService.current = null;
    setTab(next);
  }

  if (!showReservations) {
    return <ServiceBoard basePath={basePath} />;
  }

  const badgeClass = "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#c84b1e] text-white text-xs font-bold tabular-nums";
  const counts = { serviciu: serviceCount, rezervari: reservationCount };

  return (
    <div>
      <div className="flex gap-1 mb-5">
        {([
          { k: "serviciu", label: "Serviciu" },
          { k: "rezervari", label: "Rezervări" },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => switchTo(t.k)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.k ? "bg-[#1a1a1a] text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
            {counts[t.k] > 0 && <span className={badgeClass}>{counts[t.k] > 99 ? "99+" : counts[t.k]}</span>}
          </button>
        ))}
      </div>
      {tab === "serviciu" ? (
        <ServiceBoard basePath={basePath} onCount={setServiceCount} />
      ) : (
        <ReservationsBoard basePath={basePath} onCount={setReservationCount} />
      )}
    </div>
  );
}
