"use client";

import { useMemo, useState } from "react";
import { Mail, Phone, Users, Check } from "lucide-react";
import EmailClientsComposer from "@/components/admin/EmailClientsComposer";
import { formatDate } from "@/lib/utils";

export interface AdminClient {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  visits: number;
  lastVisit: string; // YYYY-MM-DD
  subscribed: boolean; // active newsletter subscriber → emailable
}

/**
 * Admin per-restaurant clients list with selection. Only CONSENTED clients (active
 * newsletter subscribers) are selectable/emailable; the rest are shown for context
 * but can't be picked. "Email selectați" sends to the current-page selection;
 * "Email toți abonații" targets every subscribed client of the restaurant.
 * Selection is scoped to the current page (pagination resets it).
 */
export default function AdminClientsManager({
  restaurantId,
  restaurantName,
  clients,
  totalClients,
  subscribedTotal,
}: {
  restaurantId: string;
  restaurantName: string;
  clients: AdminClient[];
  totalClients: number;
  subscribedTotal: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<"all" | "selected" | null>(null);

  const emailableOnPage = useMemo(() => clients.filter((c) => c.subscribed), [clients]);
  const allEmailableSelected =
    emailableOnPage.length > 0 && emailableOnPage.every((c) => selected.has(c.userId));
  const selectedIds = [...selected];

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (emailableOnPage.every((c) => n.has(c.userId))) {
        emailableOnPage.forEach((c) => n.delete(c.userId));
      } else {
        emailableOnPage.forEach((c) => n.add(c.userId));
      }
      return n;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{totalClients}</span>{" "}
          {totalClients === 1 ? "client" : "clienți"} · {subscribedTotal} abonați (pot primi email)
        </p>
        <button
          onClick={() => setComposer("all")}
          disabled={subscribedTotal === 0}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Mail className="w-3.5 h-3.5" aria-hidden /> Email toți abonații
        </button>
      </div>

      {emailableOnPage.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={allEmailableSelected}
            onChange={toggleAll}
            className="w-4 h-4 accent-[#c84b1e]"
          />
          Selectează toți abonații de pe această pagină ({emailableOnPage.length})
        </label>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {clients.map((c) => (
          <div key={c.userId} className="p-4 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-[#c84b1e] disabled:opacity-40 disabled:cursor-not-allowed"
              checked={selected.has(c.userId)}
              disabled={!c.subscribed}
              onChange={() => toggle(c.userId)}
              aria-label={`Selectează ${c.name ?? "client"}`}
              title={c.subscribed ? undefined : "Nu s-a abonat la newsletter — nu poate primi emailuri de marketing (GDPR)."}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">{c.name ?? "Client"}</p>
                {c.subscribed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-800 rounded-full px-2 py-0.5">
                    <Check className="w-3 h-3" aria-hidden /> abonat
                  </span>
                ) : (
                  <span
                    className="text-[11px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5"
                    title="Nu s-a abonat la newsletter — nu poate primi emailuri de marketing (GDPR)."
                  >
                    fără consimțământ email
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-sm text-gray-500 flex-wrap">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-gray-800">
                    <Phone className="w-3.5 h-3.5" aria-hidden /> {c.phone}
                  </a>
                )}
                {c.email && <span className="truncate">{c.email}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="inline-flex items-center gap-1 text-sm bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5">
                <Users className="w-3.5 h-3.5" aria-hidden /> {c.visits}
              </span>
              <p className="text-xs text-gray-400 mt-1">
                ultima: {formatDate(new Date(`${c.lastVisit}T00:00:00`), { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3">
          <span className="text-sm text-gray-700">
            {selectedIds.length} {selectedIds.length === 1 ? "selectat" : "selectați"}
          </span>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-800">
              Deselectează
            </button>
            <button
              onClick={() => setComposer("selected")}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] inline-flex items-center gap-1"
            >
              <Mail className="w-3.5 h-3.5" aria-hidden /> Email selectați
            </button>
          </div>
        </div>
      )}

      {composer === "all" && (
        <EmailClientsComposer restaurantId={restaurantId} restaurantName={restaurantName} onClose={() => setComposer(null)} />
      )}
      {composer === "selected" && (
        <EmailClientsComposer restaurantId={restaurantId} restaurantName={restaurantName} userIds={selectedIds} onClose={() => setComposer(null)} />
      )}
    </div>
  );
}
