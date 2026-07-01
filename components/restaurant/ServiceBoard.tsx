"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export default function ServiceBoard({ restaurantId }: { restaurantId: string }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [acking, setAcking] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const prevCount = useRef(0);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/requests?status=pending`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { data } = await res.json();
      setRequests(data ?? []);
      setLoaded(true);

      // Tab title badge + a short beep when a NEW request arrives.
      const count = data?.length ?? 0;
      if (count > prevCount.current) {
        document.title = `(${count}) Serviciu — Din Brașov`;
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch {
          /* audio not allowed until user interaction — ignore */
        }
      } else if (count === 0) {
        document.title = "Serviciu — Din Brașov";
      }
      prevCount.current = count;
    } catch {
      /* retry next poll */
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 4000);
    return () => {
      clearInterval(interval);
      document.title = "Din Brașov";
    };
  }, [fetchRequests]);

  async function ack(id: string) {
    setAcking(id);
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/requests/${id}/ack`, {
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
      <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
        Nicio cerere în acest moment. Cererile noi apar automat aici.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
