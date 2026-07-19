"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVisiblePoll } from "@/lib/useVisiblePoll";
import { notify } from "@/lib/chime";

/**
 * Small live count badge for a nav item / tab. Polls a board endpoint and shows
 * the number of open items (pending). Used for Serviciu (open service requests)
 * and Rezervări (pending reservations), on both the owner sidebar and the waiter
 * staff-link tabs. Reuses the existing authed GET endpoints — no new API.
 *
 * When the badge's own nav item is the current page (`boardPath`), the matching
 * board on that page already polls the same endpoint (and chimes), so the badge
 * suppresses its own poll to avoid a duplicate request / double chime. Otherwise
 * the badge itself chimes + OS-notifies on a new item, so an owner working on any
 * dashboard page still gets alerted about a new request/reservation.
 *
 * kind:
 *  - "service"     → GET {basePath}/requests?status=pending → count of rows
 *  - "reservations"→ GET {basePath}/reservations → count of status === "pending"
 */
export default function NavBadge({
  basePath,
  kind,
  boardPath,
  skip: skipProp = false,
  className = "",
}: {
  basePath: string;
  kind: "service" | "reservations";
  boardPath?: string;
  /** Force-skip polling (e.g. the waiter tab whose board is currently shown). */
  skip?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  // On the board's own page, the board component polls this endpoint → skip here.
  const skip = skipProp || (!!boardPath && pathname === boardPath);
  const [count, setCount] = useState(0);
  // Chime only on a genuine increase, and never on the first poll of a page.
  const prev = useRef<number | null>(null);

  async function poll() {
    if (skip) { prev.current = null; return; }
    try {
      let next = 0;
      if (kind === "service") {
        const res = await fetch(`${basePath}/requests?status=pending`, { cache: "no-store" });
        if (!res.ok) return;
        const { data } = await res.json();
        next = Array.isArray(data) ? data.length : 0;
      } else {
        const res = await fetch(`${basePath}/reservations`, { cache: "no-store" });
        if (!res.ok) return;
        const { data } = await res.json();
        next = Array.isArray(data) ? data.filter((r: { status: string }) => r.status === "pending").length : 0;
      }
      setCount(next);
      if (prev.current !== null && next > prev.current) {
        notify(
          kind === "service"
            ? { title: "Cerere nouă la masă", body: "Ai o cerere de serviciu nouă." }
            : { title: "Rezervare nouă", body: "Ai o cerere de rezervare nouă." }
        );
      }
      prev.current = next;
    } catch {
      /* keep last value; retry next tick */
    }
  }

  // Glanceable count → slower than the board itself (service 15s, reservations 30s
  // while visible; 30s when hidden). The active board carries the fast cadence.
  useVisiblePoll(poll, kind === "service" ? 15000 : 30000, 30000);

  if (skip || count <= 0) return null;

  return (
    <span
      className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#c84b1e] text-white text-xs font-bold tabular-nums ${className}`}
      aria-label={`${count} ${kind === "service" ? "cereri noi" : "rezervări în așteptare"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
