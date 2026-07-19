"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/lib/chime";
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
export default function ServiceBoard({ basePath }: { basePath: string }) {
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
  useEffect(() => () => { document.title = "Din Brașov"; }, []);

  async function ack(id: string) {
    setAcking(id);
    try {
      const res = await fetch(`${basePath}/requests/${id}/ack`, {
        method: "POST",
      });
      if (res.ok) {
        setRequests((rs) => rs.filter((r) => r.id !== id));
        prevCount.current = Math.max(0, prevCount.current - 1);
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
