"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, Mail, Users, Clock, Check, X, CalendarClock, Plus } from "lucide-react";

interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  status: "pending" | "confirmed" | "declined" | "cancelled";
  note: string | null;
}

const STATUS_LABEL: Record<Reservation["status"], string> = {
  pending: "În așteptare", confirmed: "Confirmată", declined: "Refuzată", cancelled: "Anulată",
};
const STATUS_CLASS: Record<Reservation["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

function formatDay(date: string): string {
  if (date === todayStr()) return "Azi";
  if (date === tomorrowStr()) return "Mâine";
  return new Date(`${date}T00:00:00`).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Live reservations board. `basePath` exposes `/reservations` (GET) and
 * `/reservations/{id}/status` (POST). Owner passes `/api/restaurants/{id}`; the
 * staff-link board passes `/api/s/{token}`.
 */
export default function ReservationsBoard({ basePath }: { basePath: string }) {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"azi" | "maine" | "toate">("azi");
  const [adding, setAdding] = useState(false);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/reservations`, { cache: "no-store" });
      if (!res.ok) return;
      const { data } = await res.json();
      setRows(data ?? []);
      setLoaded(true);
    } catch { /* retry */ }
  }, [basePath]);

  useEffect(() => {
    fetchRows();
    const interval = setInterval(fetchRows, 15000);
    return () => clearInterval(interval);
  }, [fetchRows]);

  async function setStatus(id: string, status: "confirmed" | "declined" | "cancelled") {
    // Confirm destructive actions — a decline/cancel can't be undone.
    if (status === "declined" && !confirm("Refuzi această rezervare? Clientul nu va mai avea masa rezervată.")) return;
    if (status === "cancelled" && !confirm("Anulezi această rezervare? Locurile vor redeveni disponibile.")) return;
    setBusy(id);
    try {
      const res = await fetch(`${basePath}/reservations/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (res.ok) await fetchRows();
    } finally { setBusy(null); }
  }

  // Summary counts.
  const counts = useMemo(() => ({
    today: rows.filter((r) => r.date === todayStr()).length,
    tomorrow: rows.filter((r) => r.date === tomorrowStr()).length,
    pending: rows.filter((r) => r.status === "pending").length,
  }), [rows]);

  // Apply the quick filter.
  const filtered = useMemo(() => {
    if (filter === "azi") return rows.filter((r) => r.date === todayStr());
    if (filter === "maine") return rows.filter((r) => r.date === tomorrowStr());
    return rows;
  }, [rows, filter]);

  // Pending first, then by date+time.
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
    return (a.date + a.time).localeCompare(b.date + b.time);
  }), [filtered]);

  if (!loaded) return <p className="text-sm text-gray-400 py-8 text-center">Se încarcă…</p>;

  const byDate = sorted.reduce<Record<string, Reservation[]>>((acc, r) => {
    (acc[r.date] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { k: "Azi", v: counts.today },
          { k: "Mâine", v: counts.tomorrow },
          { k: "În așteptare", v: counts.pending, accent: counts.pending > 0 },
        ].map((c) => (
          <div key={c.k} className={`rounded-xl border p-3 text-center ${c.accent ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
            <p className={`text-2xl font-bold tabular-nums ${c.accent ? "text-amber-700" : "text-gray-900"}`}>{c.v}</p>
            <p className="text-xs text-gray-500">{c.k}</p>
          </div>
        ))}
      </div>

      {/* Filter + manual add */}
      <div className="flex items-center gap-1 mb-4">
        {([["azi", "Azi"], ["maine", "Mâine"], ["toate", "Toate"]] as const).map(([k, label]) => (
          <button
            key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === k ? "bg-[#1a1a1a] text-white" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setAdding(true)}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold bg-[#c84b1e] text-white px-3 py-1.5 rounded-lg hover:bg-[#d9603a] transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden /> Adaugă
        </button>
      </div>

      {adding && (
        <ManualReservationModal
          basePath={basePath}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); fetchRows(); }}
        />
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-50" aria-hidden />
          <p className="text-sm">Nicio rezervare {filter === "azi" ? "azi" : filter === "maine" ? "mâine" : "viitoare"}.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([date, list]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-gray-500 mb-2 capitalize">{formatDay(date)}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {list.map((r) => {
                  const pending = r.status === "pending";
                  return (
                    <div key={r.id} className={`rounded-xl border p-4 ${pending ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"}`}>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="inline-flex items-center gap-1 font-bold text-gray-900 text-lg tabular-nums">
                          <Clock className="w-4 h-4 text-[#c84b1e]" aria-hidden /> {r.time}
                        </span>
                        <span className="inline-flex items-center gap-1 text-sm bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
                          <Users className="w-3.5 h-3.5" aria-hidden /> {r.partySize}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto ${STATUS_CLASS[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900">{r.guestName}</p>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5 flex-wrap">
                        <a href={`tel:${r.guestPhone}`} className="inline-flex items-center gap-1 hover:text-gray-800">
                          <Phone className="w-3.5 h-3.5" aria-hidden /> {r.guestPhone}
                        </a>
                        {r.guestEmail && (
                          <a href={`mailto:${r.guestEmail}`} className="inline-flex items-center gap-1 hover:text-gray-800 truncate">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> <span className="truncate">{r.guestEmail}</span>
                          </a>
                        )}
                      </div>
                      {r.note && <p className="text-sm text-gray-500 mt-1.5 italic">„{r.note}"</p>}

                      {pending && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => setStatus(r.id, "confirmed")} disabled={busy === r.id}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-sm bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
                            <Check className="w-4 h-4" aria-hidden /> Confirmă
                          </button>
                          <button onClick={() => setStatus(r.id, "declined")} disabled={busy === r.id}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-sm border border-red-300 text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50">
                            <X className="w-4 h-4" aria-hidden /> Refuză
                          </button>
                        </div>
                      )}
                      {r.status === "confirmed" && (
                        <button onClick={() => setStatus(r.id, "cancelled")} disabled={busy === r.id}
                          className="mt-3 inline-flex items-center gap-1 text-sm border border-red-300 text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                          <X className="w-4 h-4" aria-hidden /> Anulează rezervarea
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Modal for staff to add a phone-in reservation. Confirmed immediately; can force a full slot. */
function ManualReservationModal({
  basePath,
  onClose,
  onAdded,
}: {
  basePath: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overridable, setOverridable] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(force: boolean) {
    if (guestName.trim().length < 2 || guestPhone.trim().length < 6) {
      setError("Completează numele și telefonul.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`${basePath}/reservations/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, time, partySize, guestName: guestName.trim(), guestPhone: guestPhone.trim(), note: note.trim() || undefined, force }),
    });
    setSaving(false);
    if (res.ok) { onAdded(); return; }
    const d = await res.json().catch(() => ({}));
    setError(d.error ?? "Eroare.");
    setOverridable(!!d.overridable);
  }

  const field = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]";
  const maxDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Adaugă rezervare</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Închide"><X className="w-5 h-5" aria-hidden /></button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">
            {error}
            {overridable && (
              <button onClick={() => submit(true)} disabled={saving} className="block mt-2 font-semibold underline hover:no-underline">
                Adaugă oricum
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs font-medium text-gray-500">Data
            <input type="date" value={date} min={todayStr()} max={maxDate} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="text-xs font-medium text-gray-500">Ora
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`mt-1 ${field}`} />
          </label>
        </div>
        <label className="block text-xs font-medium text-gray-500 mb-3">Persoane
          <input type="number" min={1} max={50} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className={`mt-1 ${field}`} />
        </label>
        <label className="block text-xs font-medium text-gray-500 mb-3">Nume *
          <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <label className="block text-xs font-medium text-gray-500 mb-3">Telefon *
          <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <label className="block text-xs font-medium text-gray-500 mb-4">Mențiuni
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${field}`} placeholder="opțional" />
        </label>

        <button onClick={() => submit(false)} disabled={saving} className="w-full bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60">
          {saving ? "Se adaugă…" : "Adaugă rezervarea"}
        </button>
      </div>
    </div>
  );
}
