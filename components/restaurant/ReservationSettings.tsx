"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Power, CheckCircle2, Clock, Users, Home, Trees, LayoutGrid, Pause, Play, Pencil, X, CalendarOff, Eye, Hourglass } from "lucide-react";
import type { ReservationHour, Closure } from "@/lib/reservations";
import ReservationTablesManager, { type ResTableRow } from "@/components/restaurant/ReservationTablesManager";
import ReservationTableGroupsManager, { type GroupRow } from "@/components/restaurant/ReservationTableGroupsManager";
import EditHoursModal from "@/components/restaurant/EditHoursModal";

const DAYS = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
const DAYS_SHORT = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];

/** "2026-08-04" → "mar., 4 aug. 2026". Parsed as a LOCAL date, never UTC. */
function formatRoDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
  initialLongTurnEnabled,
  initialLongTurnFromParty,
  initialLongTurnMinutes,
  initialAllowReducedTurn,
  initialShowDuration,
  initialClosures,
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
  initialLongTurnEnabled: boolean;
  initialLongTurnFromParty: number;
  initialLongTurnMinutes: number;
  initialAllowReducedTurn: boolean;
  initialShowDuration: boolean;
  initialClosures: Closure[];
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
  // Long-turn rule for large parties + the shorter-stay fallback.
  const [longTurnOn, setLongTurnOn] = useState(initialLongTurnEnabled);
  const [longFrom, setLongFrom] = useState<number | "">(initialLongTurnFromParty);
  const [longMinutes, setLongMinutes] = useState(initialLongTurnMinutes);
  const [allowReduced, setAllowReduced] = useState(initialAllowReducedTurn);
  const [showDuration, setShowDuration] = useState(initialShowDuration);
  // Closed dates.
  const [closures, setClosures] = useState<Closure[]>(initialClosures);
  const [closeFrom, setCloseFrom] = useState("");
  const [closeTo, setCloseTo] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [confirmClosure, setConfirmClosure] = useState<{ count: number; affected: { date: string; time: string; partySize: number; guestName: string; guestPhone: string }[] } | null>(null);
  // Deleting an interval that still has bookings in it — show them, offer pausing instead.
  const [confirmDeleteHour, setConfirmDeleteHour] = useState<{ hourId: string; count: number; bookings: { date: string; time: string; partySize: number; guestName: string; guestPhone: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingHour, setEditingHour] = useState<ReservationHour | null>(null);
  const [confirmTables, setConfirmTables] = useState(false);
  const [confirmDisableAreas, setConfirmDisableAreas] = useState(false);
  // Separate error for the "Adaugă interval" form so it shows next to that button,
  // not only in the banner at the top of the settings (which is off-screen there).
  const [hoursError, setHoursError] = useState<string | null>(null);
  // Result of auto-assigning tables to existing bookings when switching to tables mode.
  const [switchReport, setSwitchReport] = useState<{ assigned: number; unassigned: { date: string; time: string; partySize: number; guestName: string }[] } | null>(null);

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

  async function patchSettings(next: { enabled?: boolean; confirmMode?: "auto" | "manual"; maxPartySize?: number; areasEnabled?: boolean; turnMinutes?: number; capacityMode?: "seats" | "tables"; maxJoin?: number; advanceDays?: number; longTurnEnabled?: boolean; longTurnFromParty?: number; longTurnMinutes?: number; allowReducedTurn?: boolean; showDuration?: boolean }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservations-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { router.refresh(); return d ?? {}; }
    setError(d.error ?? "Eroare.");
    return null;
  }

  /** Close a date range. `force` is set after the owner saw the affected bookings. */
  async function addClosure(force: boolean) {
    if (!closeFrom) { setCloseError("Alege data."); return; }
    if (closeTo && closeTo < closeFrom) { setCloseError("Data de sfârșit trebuie să fie după cea de început."); return; }
    setBusy(true);
    setCloseError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservation-closures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom: closeFrom, dateTo: closeTo || closeFrom, reason: closeReason || undefined, force }),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setClosures((c) => [...c, { id: crypto.randomUUID(), dateFrom: closeFrom, dateTo: closeTo || closeFrom, reason: closeReason || null }].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom)));
      setCloseFrom(""); setCloseTo(""); setCloseReason(""); setConfirmClosure(null);
      router.refresh();
      return;
    }
    // Bookings already exist in the range — show them so the owner can call those guests.
    if (d.needsConfirm) { setConfirmClosure({ count: d.affected?.length ?? 0, affected: d.affected ?? [] }); return; }
    setCloseError(d.error ?? "Eroare.");
  }

  async function removeClosure(id: string) {
    setBusy(true);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservation-closures?closureId=${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) { setClosures((c) => c.filter((x) => x.id !== id)); router.refresh(); }
    else setCloseError("Eroare la ștergere.");
  }

  async function addHours() {
    if (start >= end) { setHoursError("Ora de început trebuie să fie înainte de cea de sfârșit."); return; }
    // Coerce empty inputs to sensible minimums at save time.
    const nSeats = seats === "" ? 1 : seats;
    const nIn = seatsIn === "" ? 0 : seatsIn;
    const nOut = seatsOut === "" ? 0 : seatsOut;
    if (areas && nIn + nOut < 1) { setHoursError("Adaugă cel puțin un loc la interior sau terasă."); return; }
    setBusy(true);
    setHoursError(null);
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
    else { const d = await res.json().catch(() => ({})); setHoursError(d.error ?? "Eroare."); }
  }

  async function toggleAreas() {
    // Enabling is harmless (splits capacity/tables per area). Disabling merges them
    // back into one — reversible, but confirm so the owner knows what happens.
    if (areas) { setConfirmDisableAreas(true); return; }
    if (await patchSettings({ areasEnabled: true })) setAreas(true);
  }

  async function doDisableAreas() {
    if (await patchSettings({ areasEnabled: false })) setAreas(false);
    setConfirmDisableAreas(false);
  }

  /** Delete an interval. `force` is set after the owner has seen what's booked in it. */
  async function removeHours(hourId: string, force = false) {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/restaurants/${restaurantId}/reservation-hours?hourId=${hourId}${force ? "&force=true" : ""}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (res.ok) { setConfirmDeleteHour(null); router.refresh(); return; }
    const d = await res.json().catch(() => ({}));
    // Bookings exist inside this interval — show them, and offer pausing instead.
    if (d.needsConfirm) {
      setConfirmDeleteHour({ hourId, count: d.affected ?? 0, bookings: d.bookings ?? [] });
      return;
    }
    setError(d.error ?? "Eroare la ștergere.");
  }

  // Pause/resume an interval — kept but excluded from new bookings until re-enabled.
  async function setHourEnabled(hourId: string, enabled: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservation-hours`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourId, enabled }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? "Eroare."); }
  }
  const toggleHour = (h: ReservationHour) => setHourEnabled(h.id, !h.enabled);

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

          {/* Card 3a1 — Longer turn for large parties */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${longTurnOn ? "bg-[#c84b1e]/10" : "bg-gray-100"}`}>
                  <Hourglass className={`w-5 h-5 ${longTurnOn ? "text-[#c84b1e]" : "text-gray-500"}`} aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">Durată mai mare pentru grupuri</h3>
                  <p className="text-sm text-gray-500">
                    Grupurile mari stau de obicei mai mult. Poți să le rezervi masa pentru mai mult timp
                    decât durata obișnuită.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => { const n = !longTurnOn; if (await patchSettings({ longTurnEnabled: n })) setLongTurnOn(n); }}
                disabled={busy}
                role="switch"
                aria-checked={longTurnOn}
                aria-label="Durată mai mare pentru grupuri"
                style={{ width: 44, height: 24, minWidth: 44, minHeight: 24 }}
                className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-60 border ${
                  longTurnOn ? "bg-green-600 border-green-600" : "bg-gray-200 border-gray-300"
                }`}
              >
                <span
                  style={{ width: 18, height: 18, transform: longTurnOn ? "translateX(22px)" : "translateX(3px)" }}
                  className="inline-block rounded-full bg-white shadow-sm transition-transform"
                />
              </button>
            </div>

            {longTurnOn && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span>De la</span>
                  <input
                    type="number" min={2} max={50} value={longFrom}
                    onChange={(e) => setLongFrom(numOrEmpty(e.target.value))}
                    onBlur={() => { const v = longFrom === "" ? 6 : longFrom; setLongFrom(v); patchSettings({ longTurnFromParty: v }); }}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center"
                  />
                  <span>persoane, masa este rezervată</span>
                  <select
                    value={longMinutes}
                    onChange={(e) => { const v = Number(e.target.value); setLongMinutes(v); patchSettings({ longTurnMinutes: v }); }}
                    disabled={busy}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value={90}>1 oră 30 min</option>
                    <option value={120}>2 ore</option>
                    <option value={150}>2 ore 30 min</option>
                    <option value={180}>3 ore</option>
                    <option value={210}>3 ore 30 min</option>
                    <option value={240}>4 ore</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500">
                  Restul rezervărilor păstrează durata obișnuită de mai sus.
                </p>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowReduced}
                    onChange={async (e) => { const n = e.target.checked; setAllowReduced(n); await patchSettings({ allowReducedTurn: n }); }}
                    disabled={busy}
                    className="mt-0.5 w-4 h-4 accent-[#c84b1e] flex-shrink-0"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-gray-800">Acceptă și rezervări cu durată redusă</span>
                    <span className="block text-gray-500 mt-0.5">
                      Dacă între două rezervări rămâne loc doar pentru durata obișnuită, oferă totuși ora
                      grupului — clientul vede clar până la ce oră are masa. Fără această opțiune, ora nu
                      apare deloc și pierzi rezervarea.
                    </span>
                  </span>
                </label>

                {!showDuration && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Recomandat: pornește „Arată durata rezervării” mai jos. Altfel clienții văd mai puține
                    ore libere pentru grupuri mari, fără să înțeleagă de ce.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Card 3a1b — Show the duration to the guest */}
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Eye className="w-5 h-5 text-gray-500" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">Arată durata rezervării</h3>
                  <p className="text-sm text-gray-500">
                    Clientul vede pe formular cât timp are masa rezervată. Dacă nu vrei să afișezi o
                    limită de timp, lasă opțiunea oprită.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => { const n = !showDuration; if (await patchSettings({ showDuration: n })) setShowDuration(n); }}
                disabled={busy}
                role="switch"
                aria-checked={showDuration}
                aria-label="Arată durata rezervării"
                style={{ width: 44, height: 24, minWidth: 44, minHeight: 24 }}
                className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-60 border ${
                  showDuration ? "bg-green-600 border-green-600" : "bg-gray-200 border-gray-300"
                }`}
              >
                <span
                  style={{ width: 18, height: 18, transform: showDuration ? "translateX(22px)" : "translateX(3px)" }}
                  className="inline-block rounded-full bg-white shadow-sm transition-transform"
                />
              </button>
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
                  onClick={async () => {
                    if (o.v === capacityMode) return;
                    // Switching to "Mese individuale" is a bigger change → confirm first.
                    if (o.v === "tables") { setConfirmTables(true); return; }
                    if (await patchSettings({ capacityMode: o.v })) setCapacityMode(o.v);
                  }}
                  disabled={busy}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-colors disabled:opacity-60 ${capacityMode === o.v ? "border-[#c84b1e] bg-[#c84b1e]/5" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <p className="font-medium text-gray-900 text-sm">{o.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>
            {/* Result of the automatic table assignment done at the moment of the switch. */}
            {switchReport && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-sm border ${switchReport.unassigned.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-800"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {switchReport.assigned > 0
                        ? `Am atribuit mese pentru ${switchReport.assigned} ${switchReport.assigned === 1 ? "rezervare existentă" : "rezervări existente"}.`
                        : "Nicio rezervare viitoare nu avea nevoie de masă."}
                    </p>
                    {switchReport.unassigned.length > 0 && (
                      <>
                        <p className="mt-1">
                          {switchReport.unassigned.length === 1 ? "O rezervare nu a încăput" : `${switchReport.unassigned.length} rezervări nu au încăput`} la nicio masă — contactează clienții sau ajustează mesele:
                        </p>
                        <ul className="mt-1 list-disc list-inside">
                          {switchReport.unassigned.map((u, i) => (
                            <li key={i}>{u.date} · {u.time} — {u.guestName} ({u.partySize} pers.)</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  <button onClick={() => setSwitchReport(null)} className="text-current opacity-50 hover:opacity-100 flex-shrink-0" aria-label="Închide">
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>
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
                        <span key={h.id} className={`inline-flex items-center gap-2.5 border rounded-lg px-3 py-1.5 text-sm ${h.enabled ? "bg-gray-50 border-gray-200" : "bg-amber-50/70 border-amber-200"}`}>
                          <span className={`font-medium tabular-nums ${h.enabled ? "text-gray-800" : "text-gray-400 line-through"}`}>{h.startTime}–{h.endTime}</span>
                          <span className="text-gray-400">{h.slotMinutes}min</span>
                          {capacityMode === "tables" ? null : areas && (h.seatsInside != null || h.seatsOutside != null) ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-gray-500" title="Interior"><Home className="w-3.5 h-3.5" aria-hidden />{h.seatsInside ?? 0}</span>
                              <span className="inline-flex items-center gap-1 text-gray-500" title="Terasă"><Trees className="w-3.5 h-3.5" aria-hidden />{h.seatsOutside ?? 0}</span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-500"><Users className="w-3.5 h-3.5" aria-hidden />{h.seatsPerSlot}</span>
                          )}
                          {!h.enabled && <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">pauzat</span>}
                          <span className="inline-flex items-center gap-1.5 pl-1.5 border-l border-gray-200">
                            <button onClick={() => toggleHour(h)} disabled={busy} className="text-gray-400 hover:text-gray-800 transition-colors disabled:opacity-50" aria-label={h.enabled ? "Dezactivează intervalul" : "Reactivează intervalul"} title={h.enabled ? "Dezactivează" : "Reactivează"}>
                              {h.enabled ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}
                            </button>
                            <button onClick={() => setEditingHour(h)} disabled={busy} className="text-gray-400 hover:text-gray-800 transition-colors disabled:opacity-50" aria-label="Editează intervalul" title="Editează">
                              <Pencil className="w-4 h-4" aria-hidden />
                            </button>
                            <button onClick={() => removeHours(h.id)} disabled={busy} className="text-gray-300 hover:text-red-600 transition-colors disabled:opacity-50" aria-label="Șterge intervalul" title="Șterge">
                              <Trash2 className="w-4 h-4" aria-hidden />
                            </button>
                          </span>
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
              {hoursError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{hoursError}</p>}
            </div>
          </div>

          {/* Card 5 — Closed dates (no ONLINE bookings on these days) */}
          <div className={cardClass}>
            <div className="flex items-start gap-3 mb-1">
              <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <CalendarOff className="w-5 h-5 text-gray-500" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900">Zile închise</h3>
                <p className="text-sm text-gray-500">
                  Zile în care nu primești rezervări online (sărbători, eveniment privat, concediu).
                  Ziua dispare din formularul clienților. Rezervările deja făcute rămân neatinse, iar
                  tu poți adăuga în continuare rezervări telefonice.
                </p>
              </div>
            </div>

            {closures.length > 0 && (
              <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                {closures.map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">
                        {c.dateFrom === c.dateTo ? formatRoDate(c.dateFrom) : `${formatRoDate(c.dateFrom)} – ${formatRoDate(c.dateTo)}`}
                      </span>
                      {c.reason && <span className="block text-xs text-gray-500 truncate">{c.reason}</span>}
                    </span>
                    <button
                      onClick={() => removeClosure(c.id)}
                      disabled={busy}
                      className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50 px-2 py-1"
                    >
                      Redeschide
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className={labelClass} title="Prima zi închisă">De la
                <input type="date" value={closeFrom} onChange={(e) => setCloseFrom(e.target.value)} className={fieldClass} />
              </label>
              <label className={labelClass} title="Ultima zi închisă — lasă gol pentru o singură zi">Până la
                <input type="date" value={closeTo} min={closeFrom || undefined} onChange={(e) => setCloseTo(e.target.value)} className={fieldClass} />
              </label>
              <label className={labelClass} title="Doar pentru tine — clienții nu văd acest text">Motiv
                <input type="text" value={closeReason} maxLength={200} placeholder="opțional" onChange={(e) => setCloseReason(e.target.value)} className={fieldClass} />
              </label>
              <button
                onClick={() => addClosure(false)}
                disabled={busy || !closeFrom}
                className="inline-flex items-center justify-center gap-1 bg-[#1a1a1a] text-white text-sm h-[38px] px-3 rounded-lg hover:bg-gray-700 disabled:opacity-50 col-span-2 sm:col-span-1 self-end"
              >
                <Plus className="w-4 h-4" aria-hidden /> Închide
              </button>
            </div>
            {closeError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{closeError}</p>}
          </div>
        </>
      )}

      {/* Deleting an interval that still has bookings. They are NOT cancelled, but the
          owner may have meant „pauză” — which is reversible — so offer that first. */}
      {confirmDeleteHour && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setConfirmDeleteHour(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-semibold text-gray-900">
                Ai {confirmDeleteHour.count} {confirmDeleteHour.count === 1 ? "rezervare" : "rezervări"} în acest interval
              </h3>
              <button onClick={() => setConfirmDeleteHour(null)} aria-label="Închide" className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Ștergerea intervalului <span className="font-medium">nu anulează</span> aceste rezervări — le
              vezi în continuare în „Rezervări”. Dar dacă vrei doar să nu mai primești rezervări noi aici,
              folosește <span className="font-medium">„Oprește temporar”</span> (⏸): e reversibil, ștergerea nu.
            </p>
            <ul className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
              {confirmDeleteHour.bookings.map((b, i) => (
                <li key={i} className="py-2 text-sm flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{b.guestName}</span>
                    <span className="block text-xs text-gray-500">
                      {formatRoDate(b.date)} · {b.time} · {b.partySize} pers.
                    </span>
                  </span>
                  <a href={`tel:${b.guestPhone}`} className="text-[#c84b1e] font-medium whitespace-nowrap">{b.guestPhone}</a>
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button onClick={() => setConfirmDeleteHour(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">
                Renunță
              </button>
              <button
                onClick={async () => {
                  const hourId = confirmDeleteHour.hourId;
                  setConfirmDeleteHour(null);
                  await setHourEnabled(hourId, false);
                }}
                disabled={busy}
                className="flex-1 bg-[#1a1a1a] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-60"
              >
                Oprește temporar
              </button>
              <button onClick={() => removeHours(confirmDeleteHour.hourId, true)} disabled={busy} className="flex-1 border border-red-300 text-red-700 rounded-lg py-2.5 text-sm font-medium hover:bg-red-50 disabled:opacity-60">
                Șterge oricum
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closing a range that already holds bookings — show them so the owner can call. */}
      {confirmClosure && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setConfirmClosure(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-semibold text-gray-900">
                Ai {confirmClosure.count} {confirmClosure.count === 1 ? "rezervare" : "rezervări"} în această perioadă
              </h3>
              <button onClick={() => setConfirmClosure(null)} aria-label="Închide" className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Închiderea zilelor <span className="font-medium">nu anulează</span> aceste rezervări — ele rămân
              valabile. Dacă nu le mai poți onora, sună clienții.
            </p>
            <ul className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
              {confirmClosure.affected.map((b, i) => (
                <li key={i} className="py-2 text-sm flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{b.guestName}</span>
                    <span className="block text-xs text-gray-500">
                      {formatRoDate(b.date)} · {b.time} · {b.partySize} pers.
                    </span>
                  </span>
                  <a href={`tel:${b.guestPhone}`} className="text-[#c84b1e] font-medium whitespace-nowrap">{b.guestPhone}</a>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmClosure(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">
                Renunță
              </button>
              <button onClick={() => addClosure(true)} disabled={busy} className="flex-1 bg-[#c84b1e] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#a83d18] disabled:opacity-60">
                Închide oricum
              </button>
            </div>
          </div>
        </div>
      )}

      {editingHour && (
        <EditHoursModal
          restaurantId={restaurantId}
          hour={editingHour}
          areas={areas}
          capacityMode={capacityMode}
          onClose={() => setEditingHour(null)}
          onSaved={() => { setEditingHour(null); router.refresh(); }}
        />
      )}

      {confirmTables && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setConfirmTables(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg">Treci la „Mese individuale”?</h3>
            <p className="text-sm text-gray-600 mt-2">
              Disponibilitatea va fi calculată după mese. Rezervărilor viitoare făcute în modul „Capacitate
              totală” le atribuim automat mese, ca să nu se suprarezerve — data, ora și numărul de persoane
              rămân neschimbate. Îți spunem dacă vreuna nu a încăput.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={async () => {
                  const d = await patchSettings({ capacityMode: "tables" });
                  if (d) {
                    setCapacityMode("tables");
                    // Report what happened to bookings made in "capacitate totală".
                    if (d.tableBackfill) setSwitchReport(d.tableBackfill);
                  }
                  setConfirmTables(false);
                }}
                disabled={busy}
                className="flex-1 bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
              >
                Confirmă schimbarea
              </button>
              <button
                onClick={() => setConfirmTables(false)}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDisableAreas && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setConfirmDisableAreas(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-lg">Dezactivezi zonele (interior & terasă)?</h3>
            <p className="text-sm text-gray-600 mt-2">
              {capacityMode === "tables"
                ? "Mesele de pe terasă devin indisponibile pentru clienți (ca și cum terasa s-ar închide); mesele de la interior rămân. Rezervările existente rămân neschimbate. Reactivezi zonele oricând și mesele de pe terasă revin."
                : "Capacitatea de la interior și terasă se combină într-un total unic. Rezervările existente rămân neschimbate. Poți reactiva zonele oricând — configurările pe zone revin (le poți ajusta după)."}
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={doDisableAreas}
                disabled={busy}
                className="flex-1 bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
              >
                Dezactivează zonele
              </button>
              <button
                onClick={() => setConfirmDisableAreas(false)}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
