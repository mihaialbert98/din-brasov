"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Power, CheckCircle2, Clock, Users, Home, Trees, LayoutGrid } from "lucide-react";
import type { ReservationHour } from "@/lib/reservations";
import ReservationTablesManager, { type ResTableRow } from "@/components/restaurant/ReservationTablesManager";
import ReservationTableGroupsManager, { type GroupRow } from "@/components/restaurant/ReservationTableGroupsManager";

const DAYS = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
const DAYS_SHORT = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];

/** Owner/manager controls: enable, confirm mode, party cap, and hours + seats. */
export default function ReservationSettings({
  restaurantId,
  initialEnabled,
  initialMode,
  initialMaxParty,
  initialTurnMinutes,
  initialAreasEnabled,
  initialHours,
  initialCapacityMode,
  initialMaxJoin,
  initialAdvanceDays,
  initialResTables,
  initialGroups,
}: {
  restaurantId: string;
  initialEnabled: boolean;
  initialMode: "auto" | "manual";
  initialMaxParty: number;
  initialTurnMinutes: number;
  initialAreasEnabled: boolean;
  initialHours: ReservationHour[];
  initialCapacityMode: "seats" | "tables";
  initialMaxJoin: number;
  initialAdvanceDays: number;
  initialResTables: ResTableRow[];
  initialGroups: GroupRow[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState<"auto" | "manual">(initialMode);
  const [maxParty, setMaxParty] = useState<number | "">(initialMaxParty);
  const [turn, setTurn] = useState(initialTurnMinutes);
  const [areas, setAreas] = useState(initialAreasEnabled);
  const [capacityMode, setCapacityMode] = useState<"seats" | "tables">(initialCapacityMode);
  const [maxJoin, setMaxJoin] = useState(initialMaxJoin);
  const [advanceDays, setAdvanceDays] = useState<number | "">(initialAdvanceDays);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-window draft. Seat counts are `number | ""` so the field can be cleared
  // while typing (an empty string) instead of snapping to 0; coerced on save.
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("22:00");
  const [slot, setSlot] = useState(15);
  const [seats, setSeats] = useState<number | "">(20);
  const [seatsIn, setSeatsIn] = useState<number | "">(20);
  const [seatsOut, setSeatsOut] = useState<number | "">(12);

  // Parse a number-input value, keeping "" for an empty field.
  const numOrEmpty = (v: string): number | "" => (v === "" ? "" : Number(v));

  // Windows missing per-area seats (nudge after enabling areas).
  const windowsMissingAreas = initialHours.filter((h) => h.seatsInside == null && h.seatsOutside == null);

  async function patchSettings(next: { enabled?: boolean; confirmMode?: "auto" | "manual"; maxPartySize?: number; areasEnabled?: boolean; turnMinutes?: number; capacityMode?: "seats" | "tables"; maxJoin?: number; advanceDays?: number }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservations-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setBusy(false);
    if (res.ok) { router.refresh(); return true; }
    const d = await res.json().catch(() => ({}));
    setError(d.error ?? "Eroare.");
    return false;
  }

  async function addHours() {
    if (start >= end) { setError("Ora de început trebuie să fie înainte de cea de sfârșit."); return; }
    // Coerce empty inputs to sensible minimums at save time.
    const nSeats = seats === "" ? 1 : seats;
    const nIn = seatsIn === "" ? 0 : seatsIn;
    const nOut = seatsOut === "" ? 0 : seatsOut;
    if (areas && nIn + nOut < 1) { setError("Adaugă cel puțin un loc la interior sau terasă."); return; }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { dayOfWeek: day, startTime: start, endTime: end, slotMinutes: slot };
    if (areas) { body.seatsInside = nIn; body.seatsOutside = nOut; body.seatsPerSlot = Math.max(1, nIn + nOut); }
    else { body.seatsPerSlot = nSeats; }
    const res = await fetch(`/api/restaurants/${restaurantId}/reservation-hours`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? "Eroare."); }
  }

  async function toggleAreas() {
    const next = !areas;
    if (await patchSettings({ areasEnabled: next })) setAreas(next);
  }

  async function removeHours(hourId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservation-hours?hourId=${hourId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? "Eroare la ștergere."); }
  }

  // Group windows by day for a friendly weekly view.
  const byDay = initialHours.reduce<Record<number, ReservationHour[]>>((acc, h) => {
    (acc[h.dayOfWeek] ??= []).push(h);
    return acc;
  }, {});

  const cardClass = "bg-white rounded-xl border border-gray-200 p-5";
  // flex-col + justify-end keeps every input bottom-aligned even when a label wraps.
  const labelClass = "flex flex-col justify-end text-xs font-medium text-gray-500";
  const fieldClass = "mt-1 w-full h-[38px] border border-gray-300 rounded-lg px-2 text-sm focus:outline-none focus:border-[#c84b1e]";

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* Card 1 — Enable */}
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? "bg-green-100" : "bg-gray-100"}`}>
              <Power className={`w-5 h-5 ${enabled ? "text-green-600" : "text-gray-400"}`} aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold text-gray-900">Primește rezervări</h2>
              <p className="text-sm text-gray-500">Clienții pot rezerva o masă din pagina localului.</p>
            </div>
          </div>
          <button
            onClick={async () => { const n = !enabled; if (await patchSettings({ enabled: n })) setEnabled(n); }}
            disabled={busy}
            role="switch"
            aria-checked={enabled}
            aria-label="Primește rezervări"
            style={{ width: 44, height: 24, minWidth: 44, minHeight: 24 }}
            className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-60 border ${
              enabled ? "bg-green-600 border-green-600" : "bg-gray-200 border-gray-300"
            }`}
          >
            <span
              style={{ width: 18, height: 18, transform: enabled ? "translateX(22px)" : "translateX(3px)" }}
              className="inline-block rounded-full bg-white shadow-sm transition-transform"
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Card 2 — Confirmation mode */}
          <div className={cardClass}>
            <h3 className="font-semibold text-gray-900 mb-1">Cum confirmi rezervările</h3>
            <p className="text-sm text-gray-500 mb-3">Alege dacă rezervările sunt confirmate automat sau de tine.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {([
                { v: "auto", icon: CheckCircle2, t: "Automat", d: "Confirmate instant, fără intervenția ta." },
                { v: "manual", icon: Clock, t: "La confirmare", d: "Le confirmi tu, telefonic sau pe email." },
              ] as const).map((o) => {
                const Icon = o.icon;
                const active = mode === o.v;
                return (
                  <button
                    key={o.v}
                    onClick={async () => { setMode(o.v); await patchSettings({ confirmMode: o.v }); }}
                    disabled={busy}
                    className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${active ? "border-[#c84b1e] bg-[#c84b1e]/5" : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <span className="flex items-center gap-1.5 font-medium text-sm text-gray-900">
                      <Icon className={`w-4 h-4 ${active ? "text-[#c84b1e]" : "text-gray-400"}`} aria-hidden /> {o.t}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">{o.d}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 3 — Party cap */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-gray-500" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">Grup maxim</h3>
                  <p className="text-sm text-gray-500">Cea mai mare rezervare pe care o accepți online.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={50} value={maxParty}
                  onChange={(e) => setMaxParty(numOrEmpty(e.target.value))}
                  onBlur={() => { const v = maxParty === "" ? 1 : maxParty; setMaxParty(v); patchSettings({ maxPartySize: v }); }}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center"
                />
                <span className="text-sm text-gray-500">pers.</span>
              </div>
            </div>
          </div>

          {/* Card 3a — Turn time (how long a booking holds its seats) */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-gray-500" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">Durata unei mese</h3>
                  <p className="text-sm text-gray-500">
                    Cât timp ocupă o rezervare locurile. O rezervare la 19:00 ține locurile până la ora
                    de sfârșit a duratei — o altă rezervare nu le poate refolosi în acest timp.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={turn}
                  onChange={(e) => { const v = Number(e.target.value); setTurn(v); patchSettings({ turnMinutes: v }); }}
                  disabled={busy}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                >
                  <option value={60}>1 oră</option>
                  <option value={90}>1 oră 30 min</option>
                  <option value={120}>2 ore</option>
                  <option value={150}>2 ore 30 min</option>
                  <option value={180}>3 ore</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 3a2 — Advance booking window */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-gray-500" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">Cu cât timp înainte</h3>
                  <p className="text-sm text-gray-500">Cât de departe în viitor pot rezerva clienții.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={365} value={advanceDays}
                  onChange={(e) => setAdvanceDays(e.target.value === "" ? "" : Number(e.target.value))}
                  onBlur={() => { const v = advanceDays === "" ? 60 : advanceDays; setAdvanceDays(v); patchSettings({ advanceDays: v }); }}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center"
                />
                <span className="text-sm text-gray-500">zile</span>
              </div>
            </div>
          </div>

          {/* Card 3b — Areas (interior / terrace) */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Trees className="w-5 h-5 text-gray-500" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">Interior și terasă</h3>
                  <p className="text-sm text-gray-500">
                    Separă locurile pe zone. Clientul alege interior sau terasă, iar fiecare zonă are
                    propriile locuri per interval.
                  </p>
                </div>
              </div>
              <button
                onClick={toggleAreas}
                disabled={busy}
                role="switch"
                aria-checked={areas}
                aria-label="Interior și terasă"
                style={{ width: 44, height: 24, minWidth: 44, minHeight: 24 }}
                className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-60 border ${areas ? "bg-green-600 border-green-600" : "bg-gray-200 border-gray-300"}`}
              >
                <span style={{ width: 18, height: 18, transform: areas ? "translateX(22px)" : "translateX(3px)" }} className="inline-block rounded-full bg-white shadow-sm transition-transform" />
              </button>
            </div>
            {areas && windowsMissingAreas.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                {windowsMissingAreas.length} interval(e) au fost împărțite automat între interior și
                terasă. Verifică numărul de locuri mai jos și ajustează-l dacă e nevoie.
              </p>
            )}
          </div>

          {/* Card 3a3 — Capacity mode: total seats vs individual tables */}
          <div className={cardClass}>
            <div className="flex items-start gap-3 mb-3">
              <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <LayoutGrid className="w-5 h-5 text-gray-500" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900">Mod capacitate</h3>
                <p className="text-sm text-gray-500">
                  Cum se calculează disponibilitatea: după numărul total de locuri, sau după mese
                  individuale (cu posibilitatea de a le uni).
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "seats", label: "Capacitate totală", desc: "Un număr de locuri per interval." },
                { v: "tables", label: "Mese individuale", desc: "Mese cu locuri; se pot uni." },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  onClick={async () => { if (o.v === capacityMode) return; setCapacityMode(o.v); await patchSettings({ capacityMode: o.v }); }}
                  disabled={busy}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-colors disabled:opacity-60 ${capacityMode === o.v ? "border-[#c84b1e] bg-[#c84b1e]/5" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <p className="font-medium text-gray-900 text-sm">{o.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>
            {capacityMode === "tables" && (
              <p className="text-xs text-amber-700 mt-3">
                Schimbă modul când ai puține rezervări viitoare — rezervările făcute în modul „capacitate
                totală” nu au o masă atribuită.
              </p>
            )}
          </div>

          {/* Card 3a4 — Tables inventory + join limit (tables mode only) */}
          {capacityMode === "tables" && (
            <>
              <div className={cardClass}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Mese maxime unite</h3>
                    <p className="text-sm text-gray-500">Câte mese „se pot uni" (care nu sunt într-un grup) se pot combina. În grupuri, se pot uni toate mesele grupului.</p>
                  </div>
                  <select
                    value={maxJoin}
                    onChange={(e) => { const v = Number(e.target.value); setMaxJoin(v); patchSettings({ maxJoin: v }); }}
                    disabled={busy}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? "Fără unire" : `${n} mese`}</option>)}
                  </select>
                </div>
              </div>
              <ReservationTablesManager restaurantId={restaurantId} areasEnabled={areas} initialTables={initialResTables} />
              <ReservationTableGroupsManager restaurantId={restaurantId} tables={initialResTables} initialGroups={initialGroups} />
            </>
          )}

          {/* Card 4 — Program & seats */}
          <div className={cardClass}>
            <h3 className="font-semibold text-gray-900 mb-1">{capacityMode === "tables" ? "Program" : "Program & locuri"}</h3>
            <p className="text-sm text-gray-500 mb-4">
              Adaugă intervalele în care primești rezervări.{" "}
              {capacityMode === "tables"
                ? "În modul „Mese individuale”, capacitatea vine din mese — aici setezi doar orele."
                : areas
                ? "Setează câte locuri sunt disponibile la interior și pe terasă."
                : "Locuri = câte persoane încap în total."}{" "}
              „Start la fiecare” = cât de des poate începe o rezervare (ex: la 15 min), diferit de
              „Durata unei mese” de mai sus (cât timp stă o rezervare la masă).
            </p>

            {initialHours.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                Niciun interval încă. Adaugă cel puțin unul ca rezervările să fie posibile.
              </p>
            ) : (
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 mb-5 overflow-hidden">
                {[1, 2, 3, 4, 5, 6, 0].filter((d) => byDay[d]?.length).map((d) => (
                  <div key={d} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-9 text-sm font-semibold text-gray-700 flex-shrink-0">{DAYS_SHORT[d]}</span>
                    <div className="flex-1 flex flex-wrap gap-2">
                      {byDay[d].map((h) => (
                        <span key={h.id} className="inline-flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                          <span className="text-gray-800 font-medium tabular-nums">{h.startTime}–{h.endTime}</span>
                          <span className="text-gray-400">{h.slotMinutes}min</span>
                          {capacityMode === "tables" ? null : areas && (h.seatsInside != null || h.seatsOutside != null) ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-gray-500" title="Interior"><Home className="w-3.5 h-3.5" aria-hidden />{h.seatsInside ?? 0}</span>
                              <span className="inline-flex items-center gap-1 text-gray-500" title="Terasă"><Trees className="w-3.5 h-3.5" aria-hidden />{h.seatsOutside ?? 0}</span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-500"><Users className="w-3.5 h-3.5" aria-hidden />{h.seatsPerSlot}</span>
                          )}
                          <button onClick={() => removeHours(h.id)} disabled={busy} className="text-gray-300 hover:text-red-600 transition-colors disabled:opacity-50" aria-label="Șterge intervalul">
                            <Trash2 className="w-4 h-4" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add window */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Adaugă interval</p>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-x-3 gap-y-3">
                <label className={`${labelClass} col-span-2 sm:col-span-1`}>Ziua
                  <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={fieldClass}>
                    {[1, 2, 3, 4, 5, 6, 0].map((i) => <option key={i} value={i}>{DAYS[i]}</option>)}
                  </select>
                </label>
                <label className={labelClass}>De la
                  <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
                </label>
                <label className={labelClass}>Până la
                  <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldClass} />
                </label>
                <label className={labelClass} title="Cât de des poate începe o rezervare (nu durata mesei)">Start la fiecare
                  <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className={fieldClass}>
                    {[15, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </label>
                {/* Seat inputs only in seats mode — tables mode gets capacity from the tables. */}
                {capacityMode === "tables" ? null : areas ? (
                  <>
                    <label className={labelClass} title="Locuri interior">Interior
                      <input type="number" min={0} max={200} value={seatsIn} onChange={(e) => setSeatsIn(numOrEmpty(e.target.value))} className={fieldClass} />
                    </label>
                    <label className={labelClass} title="Locuri terasă">Terasă
                      <input type="number" min={0} max={200} value={seatsOut} onChange={(e) => setSeatsOut(numOrEmpty(e.target.value))} className={fieldClass} />
                    </label>
                  </>
                ) : (
                  <label className={labelClass} title="Câte persoane încap în total la fiecare interval">Locuri/slot
                    <input type="number" min={1} max={200} value={seats} onChange={(e) => setSeats(numOrEmpty(e.target.value))} className={fieldClass} />
                  </label>
                )}
                <button onClick={addHours} disabled={busy} className="inline-flex items-center justify-center gap-1 bg-[#1a1a1a] text-white text-sm h-[38px] px-3 rounded-lg hover:bg-gray-700 disabled:opacity-50 col-span-2 sm:col-span-1 self-end">
                  <Plus className="w-4 h-4" aria-hidden /> Adaugă
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
