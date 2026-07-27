"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ReservationHour } from "@/lib/reservations";

const DAYS = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

/**
 * Edit one reservation interval's hours / slot length / seats (the day stays fixed).
 * Only affects future bookings — existing reservations are untouched.
 */
export default function EditHoursModal({
  restaurantId,
  hour,
  areas,
  capacityMode,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  hour: ReservationHour;
  areas: boolean;
  capacityMode: "seats" | "tables";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(hour.startTime);
  const [end, setEnd] = useState(hour.endTime);
  const [slot, setSlot] = useState<number>(hour.slotMinutes);
  const [seats, setSeats] = useState<number | "">(hour.seatsPerSlot);
  const [seatsIn, setSeatsIn] = useState<number | "">(hour.seatsInside ?? 0);
  const [seatsOut, setSeatsOut] = useState<number | "">(hour.seatsOutside ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (start >= end) { setError("Ora de început trebuie să fie înainte de cea de sfârșit."); return; }
    const body: Record<string, unknown> = { hourId: hour.id, startTime: start, endTime: end, slotMinutes: slot };
    if (capacityMode !== "tables") {
      if (areas) {
        const nIn = seatsIn === "" ? 0 : seatsIn, nOut = seatsOut === "" ? 0 : seatsOut;
        if (nIn + nOut < 1) { setError("Adaugă cel puțin un loc la interior sau terasă."); return; }
        body.seatsInside = nIn; body.seatsOutside = nOut; body.seatsPerSlot = Math.max(1, nIn + nOut);
      } else {
        body.seatsPerSlot = seats === "" ? 1 : seats;
      }
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/restaurants/${restaurantId}/reservation-hours`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? "Eroare."); }
  }

  const field = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]";
  const lbl = "block text-xs font-medium text-gray-500";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Editează intervalul</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Închide"><X className="w-5 h-5" aria-hidden /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{DAYS[hour.dayOfWeek]} · modificările se aplică doar rezervărilor viitoare</p>

        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}

        <div className="grid grid-cols-3 gap-3 mb-3">
          <label className={lbl}>Început
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={lbl}>Sfârșit
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className={lbl}>Slot (min)
            <input type="number" min={10} max={240} value={slot} onChange={(e) => setSlot(Number(e.target.value) || 15)} className={`mt-1 ${field}`} />
          </label>
        </div>

        {capacityMode !== "tables" && (areas ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className={lbl}>Locuri interior
              <input type="number" min={0} max={200} value={seatsIn} onChange={(e) => setSeatsIn(e.target.value === "" ? "" : Number(e.target.value))} className={`mt-1 ${field}`} />
            </label>
            <label className={lbl}>Locuri terasă
              <input type="number" min={0} max={200} value={seatsOut} onChange={(e) => setSeatsOut(e.target.value === "" ? "" : Number(e.target.value))} className={`mt-1 ${field}`} />
            </label>
          </div>
        ) : (
          <label className={`${lbl} mb-4`}>Locuri/slot
            <input type="number" min={1} max={200} value={seats} onChange={(e) => setSeats(e.target.value === "" ? "" : Number(e.target.value))} className={`mt-1 ${field}`} />
          </label>
        ))}

        <button onClick={save} disabled={saving} className="w-full bg-[#1a1a1a] text-white font-semibold py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-60">
          {saving ? "Se salvează…" : "Salvează modificările"}
        </button>
      </div>
    </div>
  );
}
