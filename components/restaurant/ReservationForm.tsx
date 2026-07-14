"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Users, CalendarDays, Clock, Sparkles, X, Home, Trees } from "lucide-react";
import type { ReservationHour } from "@/lib/reservations";

type Prefill = { name?: string | null; phone?: string | null; email?: string | null };

const WEEKDAYS = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];

/**
 * Public table-reservation form. Flow: party size → day → time. Days are chips of
 * the next ~14 open days; time slots are fetched live per (day, party) so full
 * slots never appear. Name + phone required, email optional.
 */
type Area = "inside" | "outside";

export default function ReservationForm({
  restaurantId,
  restaurantName,
  hours,
  confirmMode,
  maxParty,
  areasEnabled = false,
  prefill,
  isMember = false,
}: {
  restaurantId: string;
  restaurantName: string;
  hours: ReservationHour[];
  confirmMode: "auto" | "manual";
  maxParty: number;
  areasEnabled?: boolean;
  prefill?: Prefill;
  isMember?: boolean;
}) {
  const mountedAt = useRef(Date.now());
  const [partySize, setPartySize] = useState(2);
  const [area, setArea] = useState<Area | null>(areasEnabled ? null : "inside");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [otherAreaSlots, setOtherAreaSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [done, setDone] = useState<null | "confirmed" | "pending">(null);
  const [showSignup, setShowSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bookableDays = useMemo(() => new Set(hours.map((h) => h.dayOfWeek)), [hours]);

  // Next 14 days that the restaurant is open, as chips.
  const dayChips = useMemo(() => {
    const out: { value: string; weekday: string; dayNum: number; month: string }[] = [];
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (!bookableDays.has(d.getDay())) continue;
      out.push({
        value: d.toISOString().slice(0, 10),
        weekday: i === 0 ? "Azi" : i === 1 ? "Mâine" : WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        month: d.toLocaleDateString("ro-RO", { month: "short" }),
      });
    }
    return out;
  }, [bookableDays]);

  // Fetch live availability whenever party size, date, or area changes.
  useEffect(() => {
    if (!date || (areasEnabled && !area)) { setSlots([]); setOtherAreaSlots([]); return; }
    let cancelled = false;
    setSlotsLoading(true);
    setTime("");
    const areaParam = areasEnabled && area ? `&area=${area}` : "";
    fetch(`/api/reservations/availability?restaurantId=${restaurantId}&date=${date}&partySize=${partySize}${areaParam}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setSlots(d.slots ?? []); setOtherAreaSlots(d.otherAreaSlots ?? []); } })
      .catch(() => { if (!cancelled) { setSlots([]); setOtherAreaSlots([]); } })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId, date, partySize, area, areasEnabled]);

  // When the booking succeeds, the success screen replaces the (scrolled-down)
  // form — bring the user back to the top so they see the confirmation.
  useEffect(() => {
    if (done) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [done]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId, date, time, partySize,
        area: areasEnabled && area ? area : undefined,
        guestName: (form.get("guestName") as string)?.trim(),
        guestPhone: (form.get("guestPhone") as string)?.trim(),
        guestEmail: (form.get("guestEmail") as string)?.trim() || undefined,
        note: (form.get("note") as string)?.trim() || undefined,
        website: form.get("website") || "",
        elapsed: Date.now() - mountedAt.current,
      }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Eroare. Încearcă din nou."); return; }
    setDone(data.status === "confirmed" ? "confirmed" : "pending");
    if (!isMember) setShowSignup(true); // gentle account invite, easy to dismiss
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-green-700" aria-hidden />
          </div>
          <h2 className="font-serif text-xl font-semibold text-ink mb-1">
            {done === "confirmed" ? "Rezervare confirmată!" : "Cerere de rezervare trimisă!"}
          </h2>
          <p className="text-sm text-muted">
            {done === "confirmed"
              ? `Te așteptăm la ${restaurantName}.`
              : `${restaurantName} îți va confirma rezervarea în curând, telefonic.`}
          </p>
        </div>

        {/* Gentle inline account invite under the confirmation — dismissible, not a modal. */}
        {showSignup && (
          <div className="bg-surface border border-hairline rounded-2xl p-5 relative">
            <button
              onClick={() => setShowSignup(false)}
              className="absolute top-3 right-3 text-faint hover:text-ink transition-colors"
              aria-label="Închide"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-accent" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg font-semibold text-ink leading-snug">Descoperă Brașovul</h3>
                <p className="text-sm text-muted mt-0.5 mb-3">
                  Evenimente, localuri noi și anunțuri din oraș — toate într-un singur cont, gratuit.
                </p>
                <Link
                  href="/cont-nou?callbackUrl=%2F&from=rezervare"
                  className="inline-flex items-center justify-center bg-accent text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-accent-hover transition-colors"
                >
                  Creează cont gratuit
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const inputClass =
    "border border-hairline rounded-lg px-4 py-3 text-base focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent";
  const stepLabel = "flex items-center gap-1.5 text-sm font-semibold text-ink mb-2";

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-hairline p-6 space-y-6">
      {error && <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* 1 — Party size */}
      <div>
        <p className={stepLabel}><Users className="w-4 h-4 text-accent" aria-hidden /> Câte persoane?</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: Math.min(maxParty, 12) }, (_, i) => i + 1).map((n) => (
            <button
              key={n} type="button" onClick={() => setPartySize(n)}
              className={`w-11 h-11 rounded-xl border text-sm font-medium transition-colors ${
                partySize === n ? "bg-accent text-white border-accent" : "border-hairline text-ink hover:border-accent/50"
              }`}
            >
              {n}
            </button>
          ))}
          {maxParty > 12 && (
            <select
              value={partySize > 12 ? partySize : ""} onChange={(e) => setPartySize(Number(e.target.value))}
              className="h-11 rounded-xl border border-hairline px-3 text-sm"
            >
              <option value="">13+</option>
              {Array.from({ length: maxParty - 12 }, (_, i) => i + 13).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* 1b — Area (only when the restaurant splits interior/terasă) */}
      {areasEnabled && (
        <div>
          <p className={stepLabel}><Trees className="w-4 h-4 text-accent" aria-hidden /> Unde vrei să stai?</p>
          <div className="flex gap-2">
            {([
              { v: "inside" as const, icon: Home, label: "Interior" },
              { v: "outside" as const, icon: Trees, label: "Terasă" },
            ]).map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.v} type="button" onClick={() => setArea(o.v)}
                  className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl border text-sm font-medium transition-colors ${
                    area === o.v ? "bg-accent text-white border-accent" : "border-hairline text-ink hover:border-accent/50"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden /> {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2 — Day (after area is chosen when areas are on) */}
      {(!areasEnabled || area) && (
      <div>
        <p className={stepLabel}><CalendarDays className="w-4 h-4 text-accent" aria-hidden /> În ce zi?</p>
        {dayChips.length === 0 ? (
          <p className="text-sm text-muted">Momentan nu sunt zile disponibile pentru rezervare.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {dayChips.map((c) => (
              <button
                key={c.value} type="button" onClick={() => setDate(c.value)}
                className={`flex flex-col items-center justify-center min-w-[64px] h-16 rounded-xl border transition-colors flex-shrink-0 ${
                  date === c.value ? "bg-accent text-white border-accent" : "border-hairline text-ink hover:border-accent/50"
                }`}
              >
                <span className="text-[11px] uppercase tracking-wide opacity-80">{c.weekday}</span>
                <span className="text-lg font-semibold leading-none tabular-nums">{c.dayNum}</span>
                <span className="text-[11px] opacity-80">{c.month}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {/* 3 — Time */}
      {date && (!areasEnabled || area) && (
        <div>
          <p className={stepLabel}><Clock className="w-4 h-4 text-accent" aria-hidden /> La ce oră?</p>
          {slotsLoading ? (
            <p className="text-sm text-faint">Se caută orele disponibile…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted">
              Nicio oră disponibilă pentru {partySize} pers.
              {areasEnabled && area ? ` la ${area === "inside" ? "interior" : "terasă"}` : ""} în această zi.
              {areasEnabled && area && otherAreaSlots.length > 0 ? (
                <> Dar ai locuri {area === "inside" ? "pe terasă" : "la interior"} —{" "}
                  <button type="button" onClick={() => setArea(area === "inside" ? "outside" : "inside")} className="text-accent font-medium underline hover:no-underline">
                    schimbă zona
                  </button>.
                </>
              ) : " Încearcă altă zi sau un grup mai mic."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s} type="button" onClick={() => setTime(s)}
                  className={`px-4 h-11 rounded-xl border text-sm font-medium tabular-nums transition-colors ${
                    time === s ? "bg-accent text-white border-accent" : "border-hairline text-ink hover:border-accent/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4 — Contact (only once a slot is chosen) */}
      {time && (
        <div className="space-y-4 border-t border-hairline pt-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="guestName" className="font-medium text-ink text-sm">Nume *</label>
              <input id="guestName" name="guestName" type="text" required defaultValue={prefill?.name ?? ""} autoComplete="name" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="guestPhone" className="font-medium text-ink text-sm">Telefon *</label>
              <input id="guestPhone" name="guestPhone" type="tel" required defaultValue={prefill?.phone ?? ""} autoComplete="tel" className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="guestEmail" className="font-medium text-ink text-sm">Email (opțional)</label>
            <input id="guestEmail" name="guestEmail" type="email" defaultValue={prefill?.email ?? ""} autoComplete="email" className={inputClass} />
            <span className="text-xs text-faint">Îți trimitem confirmarea pe email dacă îl completezi.</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="note" className="font-medium text-ink text-sm">Mențiuni (opțional)</label>
            <textarea id="note" name="note" rows={2} className={inputClass} placeholder="Ex: masă la geam, scaun pentru copil…" />
          </div>

          {/* Honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <button
            type="submit" disabled={loading}
            className="w-full bg-accent text-white font-semibold py-3 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {loading ? "Se trimite…" : confirmMode === "auto" ? "Rezervă masa" : "Trimite cererea de rezervare"}
          </button>
          {confirmMode === "manual" && (
            <p className="text-xs text-faint text-center">Rezervarea va fi confirmată de restaurant telefonic sau pe email.</p>
          )}
        </div>
      )}
    </form>
  );
}
