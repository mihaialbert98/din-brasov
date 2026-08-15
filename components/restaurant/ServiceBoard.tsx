"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/lib/chime";
import { useRepeatingChime, serviceNeedsNudge } from "@/lib/useRepeatingChime";
import { useVisiblePoll } from "@/lib/useVisiblePoll";
import NotifyPermission from "@/components/restaurant/NotifyPermission";

interface ServiceRequest {
  id: string;
  type: "call_waiter" | "request_check";
  paymentMethod: "cash" | "card" | null;
  createdAt: string;
  tableLabel: string;
}

const TYPE_LABEL: Record<ServiceRequest["type"], string> = {
  call_waiter: "Cheamă ospătarul",
  request_check: "Nota, vă rog",
};

const PAY_LABEL: Record<string, string> = { cash: "numerar", card: "card" };

/** e.g. "Nota, vă rog (card)" for a check with a chosen payment method. */
function requestLabel(r: ServiceRequest): string {
  const base = TYPE_LABEL[r.type];
  if (r.type === "request_check" && r.paymentMethod) {
    return `${base} (${PAY_LABEL[r.paymentMethod] ?? r.paymentMethod})`;
  }
  return base;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `acum ${s}s`;
  const m = Math.floor(s / 60);
  return `acum ${m} min`;
}

/**
 * `basePath` is the API prefix that exposes `/requests` (GET pending) and
 * `/requests/{id}/ack` (POST). The logged-in owner board passes
 * `/api/restaurants/{id}`; the public staff-link board passes `/api/s/{token}`.
 */
export default function ServiceBoard({ basePath, onCount }: { basePath: string; onCount?: (n: number) => void }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [acking, setAcking] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const prevCount = useRef(0);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/requests?status=pending`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { data } = await res.json();
      setRequests(data ?? []);
      setLoaded(true);

      // Tab title badge + chime/notification when a NEW request arrives.
      const list: ServiceRequest[] = data ?? [];
      const count = list.length;
      if (count > prevCount.current) {
        document.title = `(${count}) Serviciu — Din Brașov`;
        // Describe the newest request (last by createdAt) for the OS notification.
        const newest = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
        notify({
          title: "Cerere nouă la masă",
          body: newest ? `${newest.tableLabel} — ${requestLabel(newest)}` : undefined,
        });
      } else if (count === 0) {
        document.title = "Serviciu — Din Brașov";
      }
      prevCount.current = count;
    } catch {
      /* retry next poll */
    }
  }, [basePath]);

  // Poll every 8s while visible, 30s when the tab is hidden (background OS
  // notifications still fire, at a lower rate to save requests at scale).
  useVisiblePoll(fetchRequests, 8000, 30000);

  // Keep chiming every 15s while a table is still waiting — one alert is easy to
  // miss mid-service. Stops as soon as the last request is acknowledged.
  useRepeatingChime(serviceNeedsNudge(requests.length));

  // Single place that reports the open-request count to the parent badge, in an
  // EFFECT rather than during render. Also lowers the chime baseline when requests
  // are acknowledged, so the next genuinely new one still registers as a rise.
  useEffect(() => {
    onCount?.(requests.length);
    if (requests.length < prevCount.current) prevCount.current = requests.length;
  }, [requests.length, onCount]);
  useEffect(() => () => { document.title = "Din Brașov"; }, []);

  async function ack(id: string) {
    setAcking(id);
    try {
      const res = await fetch(`${basePath}/requests/${id}/ack`, {
        method: "POST",
      });
      if (res.ok) {
        // Optimistic removal. The updater stays PURE: React runs it during the
        // render phase, so calling the parent's setState (onCount) from inside it
        // raised "Cannot update a component while rendering a different component".
        // The badge and the chime baseline are synced by the effect below instead.
        setRequests((rs) => rs.filter((r) => r.id !== id));
      }
    } finally {
      setAcking(null);
    }
  }

  if (loaded && requests.length === 0) {
    return (
      <>
        <NotifyPermission />
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
          Nicio cerere în acest moment. Cererile noi apar automat aici.
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <NotifyPermission />
      {requests.map((r) => (
        <div
          key={r.id}
          className={`bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-3 border-l-4 ${
            r.type === "request_check" ? "border-gray-900" : "border-[#c84b1e]"
          }`}
        >
          <div>
            <p className="font-semibold text-gray-900">{r.tableLabel}</p>
            <p className="text-sm text-gray-600">
              {requestLabel(r)} <span className="text-gray-400">· {timeAgo(r.createdAt)}</span>
            </p>
          </div>
          <button
            onClick={() => ack(r.id)}
            disabled={acking === r.id}
            className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60 flex-shrink-0"
          >
            {acking === r.id ? "..." : "Am preluat"}
          </button>
        </div>
      ))}
    </div>
  );
}
