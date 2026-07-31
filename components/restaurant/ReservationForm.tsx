"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Users, CalendarDays, Clock, Sparkles, X, Home, Trees } from "lucide-react";
import type { ReservationHour } from "@/lib/reservations";

type Prefill = { name?: string | null; phone?: string | null; email?: string | null };

/** Closed date ranges (inclusive) — those days never appear as bookable chips. */
export type ClosureRange = { dateFrom: string; dateTo: string };

/**
 * How long the table is held. `show` is the owner's opt-in to display it at all;
 * the long-turn rule mirrors `turnFor()` on the server so the form can name the
 * duration for the current party size before any slot is fetched.
 */
export type DurationInfo = {
  show: boolean;
  turn: number;
  longTurn: { enabled: boolean; fromParty: number; minutes: number };
};

/** minutes → "1 oră 30 min" / "2 ore". */
function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h === 0 ? "" : h === 1 ? "1 oră" : `${h} ore`, m === 0 ? "" : `${m} min`].filter(Boolean).join(" ");
}

/** Add days to a "YYYY-MM-DD" date (UTC arithmetic, so DST can't shift it). */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** "2026-08-08" → "sâmbătă, 8 aug." */
function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "short" });
}

/** "19:30" + 90 → "21:00". */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const WEEKDAYS = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];

/**
 * Local "YYYY-MM-DD" — uses the browser's LOCAL date parts, unlike
 * `toISOString()` which converts to UTC and can roll to the previous/next day in
 * the small hours (e.g. 02:00 in UTC+3 → the day before). The whole booking flow
 * keys off local weekdays (`getDay()`), so the date string must be local too.
 */
function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  hasSavedPhone = false,
  isSubscriber = false,
  advanceDays = 60,
  closures = [],
  duration,
}: {
  restaurantId: string;
  restaurantName: string;
  hours: ReservationHour[];
  confirmMode: "auto" | "manual";
  maxParty: number;
  areasEnabled?: boolean;
  prefill?: Prefill;
  isMember?: boolean;
  hasSavedPhone?: boolean;
  isSubscriber?: boolean;
  advanceDays?: number;
  closures?: ClosureRange[];
  duration: DurationInfo;
}) {
  const mountedAt = useRef(Date.now());
  const [partySize, setPartySize] = useState(2);
  const [area, setArea] = useState<Area | null>(areasEnabled ? null : "inside");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  // Nearest bookable date, offered as a one-tap fix when the picked one is refused.
  const [dateSuggestion, setDateSuggestion] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  // Times that fit only at the restaurant's standard (shorter) duration — offered
  // separately, with their real end time, so a large party doesn't lose the booking.
  const [reducedSlots, setReducedSlots] = useState<string[]>([]);
  const [reducedTurn, setReducedTurn] = useState(duration.turn);
  const [otherAreaSlots, setOtherAreaSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [done, setDone] = useState<null | "confirmed" | "pending">(null);
  const [showSignup, setShowSignup] = useState(false);
  const [email, setEmail] = useState(prefill?.email ?? "");
  // Whether this booking will get an email update: a logged-in member (account
  // email) or a guest who typed an email. Drives the field hint + success message.
  const willEmail = isMember || email.trim().length > 0;
  // Logged-in extras.
  const [updatePhone, setUpdatePhone] = useState(false);
  const [subscribePromo, setSubscribePromo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only days with an ACTIVE (non-paused) interval are offered. A weekday whose
  // intervals are all paused drops off the form (it would yield no times anyway).
  const bookableDays = useMemo(() => new Set(hours.filter((h) => h.enabled).map((h) => h.dayOfWeek)), [hours]);

  // The duration THIS party would get, mirroring turnFor() on the server.
  const partyTurn = duration.longTurn.enabled && partySize >= duration.longTurn.fromParty
    ? duration.longTurn.minutes
    : duration.turn;
  // Once a time is picked, a reduced slot overrides it with the shorter stay.
  const chosenTurn = time && reducedSlots.includes(time) ? reducedTurn : partyTurn;
  /** Owner-opt-in line telling the guest how long the table is theirs. */
  const durationNote = !duration.show
    ? null
    : time
    ? `Masa este rezervată ${formatDuration(chosenTurn)} — de la ${time} până la ${addMinutes(time, chosenTurn)}.`
    : partyTurn > duration.turn
    ? `Pentru grupuri de ${duration.longTurn.fromParty}+ persoane, masa este rezervată ${formatDuration(partyTurn)}.`
    : `Masa este rezervată ${formatDuration(partyTurn)}.`;

  /**
   * Why a date can't be booked, or null when it's fine. A native date input can only
   * constrain min/max — it can't grey out closed weekdays or closed periods — so the
   * exact reason is explained on selection instead. Mirrors the server's gate, which
   * is what actually decides.
   */
  const dateBlockedReason = useCallback(
    (iso: string): string | null => {
      const today = localISODate(new Date());
      if (iso < today) return "Data a trecut. Alege o zi din viitor.";
      if (iso > addDaysISO(today, advanceDays)) return `Poți rezerva cu cel mult ${advanceDays} de zile înainte.`;
      if (!bookableDays.has(new Date(`${iso}T00:00:00`).getDay())) return "Restaurantul e închis în această zi.";
      if (closures.some((c) => iso >= c.dateFrom && iso <= c.dateTo)) {
        return "Restaurantul nu primește rezervări în această perioadă.";
      }
      return null;
    },
    [bookableDays, closures, advanceDays],
  );

  /** First bookable date on or after `startIso`; falls back to the first from today. */
  const firstBookableFrom = useCallback(
    (startIso: string): string | null => {
      const today = localISODate(new Date());
      const scan = (from: string) => {
        let cur = from < today ? today : from;
        for (let i = 0; i <= advanceDays; i++) {
          if (!dateBlockedReason(cur)) return cur;
          cur = addDaysISO(cur, 1);
        }
        return null;
      };
      // Picking a date beyond the window leaves nothing after it — fall back to the
      // soonest open day so the suggestion is always actionable.
      return scan(startIso) ?? scan(today);
    },
    [dateBlockedReason, advanceDays],
  );

  // Next 14 days that the restaurant is open, as chips. Days the owner marked as
  // closed are skipped entirely — they'd be a dead end (the server offers nothing).
  const dayChips = useMemo(() => {
    const isClosed = (iso: string) => closures.some((c) => iso >= c.dateFrom && iso <= c.dateTo);
    const out: { value: string; weekday: string; dayNum: number; month: string }[] = [];
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (!bookableDays.has(d.getDay())) continue;
      if (isClosed(localISODate(d))) continue;
      out.push({
        value: localISODate(d),
        weekday: i === 0 ? "Azi" : i === 1 ? "Mâine" : WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        month: d.toLocaleDateString("ro-RO", { month: "short" }),
      });
    }
    return out;
  }, [bookableDays, closures]);

  // Read out of the prop object so the effect below depends on a primitive.
  const standardTurn = duration.turn;

  // Fetch live availability whenever party size, date, or area changes.
  useEffect(() => {
    if (!date || (areasEnabled && !area)) { setSlots([]); setReducedSlots([]); setOtherAreaSlots([]); return; }
    let cancelled = false;
    setSlotsLoading(true);
    setTime("");
    const areaParam = areasEnabled && area ? `&area=${area}` : "";
    fetch(`/api/reservations/availability?restaurantId=${restaurantId}&date=${date}&partySize=${partySize}${areaParam}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSlots(d.slots ?? []);
        setReducedSlots(d.reducedSlots ?? []);
        setReducedTurn(d.reducedTurnMinutes ?? standardTurn);
        setOtherAreaSlots(d.otherAreaSlots ?? []);
      })
      .catch(() => { if (!cancelled) { setSlots([]); setReducedSlots([]); setOtherAreaSlots([]); } })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId, date, partySize, area, areasEnabled, standardTurn]);

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
        // Opting into a shorter stay. The server re-derives this — it only ever
        // unlocks a slot that genuinely fits at the standard duration.
        acceptReducedTurn: reducedSlots.includes(time) || undefined,
        guestName: (form.get("guestName") as string)?.trim(),
        guestPhone: (form.get("guestPhone") as string)?.trim(),
        guestEmail: (form.get("guestEmail") as string)?.trim() || undefined,
        note: (form.get("note") as string)?.trim() || undefined,
        updatePhone: isMember && hasSavedPhone ? updatePhone : undefined,
        subscribePromo: !isSubscriber ? subscribePromo : undefined,
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
    // For logged-in members, point them to their account — appended to the main
    // confirmation line so it shows even if the account card below is missed.
    const profileHint = isMember
      ? done === "confirmed"
        ? " Îți poți vedea rezervarea oricând dacă apeși pe numele tău din colțul din dreapta sus și mergi la Rezervări."
        : " Poți urmări starea rezervării apăsând pe numele tău din colțul din dreapta sus și mergând la Rezervări, de unde o poți și gestiona."
      : "";
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
            {(done === "confirmed"
              ? willEmail
                ? "Rezervarea ta este confirmată — poți sta liniștit, totul e în regulă. Vei primi în câteva minute un email de confirmare (verifică și folderul Spam/Promoții dacă nu îl găsești)."
                : `Rezervarea ta este confirmată — poți sta liniștit, totul e în regulă. Te așteptăm la ${restaurantName}.`
              : willEmail
              ? `Cererea ta de rezervare a fost trimisă. Vei primi un email de confirmare imediat ce ${restaurantName} acceptă rezervarea (verifică și folderul Spam/Promoții).`
              : `Cererea ta de rezervare a fost trimisă. ${restaurantName} te va contacta telefonic pentru a-ți confirma rezervarea.`) + profileHint}
          </p>
        </div>

        {done === "confirmed" && (
          <p className="text-xs text-muted bg-cream/40 border border-hairline rounded-lg px-3 py-2 flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" aria-hidden />
            <span>
              Te rugăm să ajungi la timp. Dacă întârzii mai mult de 15 minute față de ora rezervării, aceasta poate fi anulată.
              {durationNote && <> {durationNote}</>}
            </span>
          </p>
        )}

        {/* Logged-in members: point them to their account to view/manage this booking. */}
        {isMember && (
          <div className="bg-surface border border-hairline rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-5 h-5 text-accent" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg font-semibold text-ink leading-snug">Rezervarea e în contul tău</h3>
                <p className="text-sm text-muted mt-0.5 mb-3">
                  {done === "confirmed"
                    ? "O găsești oricând apăsând pe numele tău din colțul de sus → Rezervări, de unde o poți vedea sau anula."
                    : "Poți urmări starea rezervării apăsând pe numele tău din colțul de sus → Rezervări, de unde o poți și gestiona."}
                </p>
                <Link
                  href="/profil/rezervari"
                  className="inline-flex items-center justify-center bg-accent text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-accent-hover transition-colors"
                >
                  Vezi rezervările mele
                </Link>
              </div>
            </div>
          </div>
        )}

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
                <h3 className="font-serif text-lg font-semibold text-ink leading-snug">Creează un cont gratuit</h3>
                <p className="text-sm text-muted mt-0.5 mb-3">
                  Îți gestionezi rezervările (le vezi și le anulezi) și, dacă vrei, primești oferte de la
                  restaurantele din Brașov — totul din contul tău.
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

      {/* Logged-out prompt — non-blocking. Booking never requires an account;
          this offers login/signup so they can manage the reservation afterward. */}
      {!isMember && (
        <div className="bg-cream/40 border border-hairline rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm text-ink font-medium">Ai un cont?</span>
          <Link href="/intra" className="text-sm text-accent font-semibold hover:underline">Conectează-te</Link>
          <span className="text-faint text-sm">sau</span>
          <Link href="/cont-nou?callbackUrl=%2F&from=rezervare" className="text-sm text-accent font-semibold hover:underline">Creează cont</Link>
          <span className="text-xs text-muted w-full">ca să-ți gestionezi rezervările — dar poți rezerva și fără cont.</span>
        </div>
      )}

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

        {/* Exact-date picker — book any open day within the advance window. */}
        <div className="mt-3">
          <label className="text-xs text-muted flex items-center gap-2 flex-wrap">
            <span>sau alege data:</span>
            <input
              type="date"
              value={date}
              min={localISODate(new Date())}
              max={localISODate(new Date(Date.now() + advanceDays * 86400000))}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) { setDate(""); setDateError(null); setDateSuggestion(null); return; }
                const reason = dateBlockedReason(v);
                if (reason) {
                  setDateError(reason);
                  setDateSuggestion(firstBookableFrom(v));
                  setDate("");
                } else {
                  setDateError(null);
                  setDateSuggestion(null);
                  setDate(v);
                }
              }}
              className="border border-hairline rounded-lg px-3 py-2 text-sm text-ink bg-surface focus:outline-none focus:border-accent"
            />
          </label>
          {dateError && (
            <p className="text-xs text-amber-700 mt-1">
              {dateError}
              {/* The picker can't grey out unavailable days, so offer the nearest one
                  that works — a single tap instead of hunting through the calendar. */}
              {dateSuggestion && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => { setDate(dateSuggestion); setDateError(null); setDateSuggestion(null); }}
                    className="text-accent font-medium underline hover:no-underline"
                  >
                    Prima zi liberă: {formatDayLabel(dateSuggestion)}
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
      )}

      {/* 3 — Time */}
      {date && (!areasEnabled || area) && (
        <div>
          <p className={stepLabel}><Clock className="w-4 h-4 text-accent" aria-hidden /> La ce oră?</p>
          {slotsLoading ? (
            <p className="text-sm text-faint">Se caută orele disponibile…</p>
          ) : slots.length === 0 && reducedSlots.length === 0 ? (
            <p className="text-sm text-muted">
              Nicio oră disponibilă pentru {partySize} pers.
              {areasEnabled && area ? ` la ${area === "inside" ? "interior" : "terasă"}` : ""} în această zi.
              {areasEnabled && area && otherAreaSlots.length > 0 ? (
                <> Dar ai locuri {area === "inside" ? "pe terasă" : "la interior"} —{" "}
                  <button type="button" onClick={() => setArea(area === "inside" ? "outside" : "inside")} className="text-accent font-medium underline hover:no-underline">
                    schimbă zona
                  </button>.
                </>
              ) : partyTurn > duration.turn ? (
                // The large-party rule is the likely reason this day looks empty —
                // say so, instead of leaving them guessing.
                <> Pentru {partySize} persoane rezervăm masa {formatDuration(partyTurn)}, iar azi nu mai
                  avem un interval liber atât de lung. Încearcă altă zi sau un grup mai mic.</>
              ) : " Încearcă altă zi sau un grup mai mic."}
            </p>
          ) : (
            <div className="space-y-3">
              {slots.length > 0 && (
                <div>
                  {/* Only labelled when there's a shorter option below to contrast with —
                      otherwise the duration is noise. States the rule ONCE, here, so the
                      reduced block underneath is just the exception to it. */}
                  {reducedSlots.length > 0 && (
                    <p className="text-xs text-muted mb-2">
                      Pentru {partySize} {partySize === 1 ? "persoană" : "persoane"} rezervăm masa{" "}
                      {formatDuration(partyTurn)}. La {slots.length > 1 ? "orele" : "ora"} de mai jos ai
                      timpul întreg:
                    </p>
                  )}
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
                </div>
              )}

              {/* Times that fit only at the shorter, standard duration. Labelled with
                  the real end time so the guest knows exactly what they're accepting. */}
              {reducedSlots.length > 0 && (
                <div className="rounded-xl border border-hairline bg-cream/40 p-3">
                  {/* The rule is already stated above the full-duration row, so this is
                      just the exception to it. When there IS no row above, it has to carry
                      the rule itself. "atât timp liber" avoids adjective agreement trouble
                      ("2 ore libere" vs "90 min libere"). */}
                  <p className="text-xs text-muted mb-2">
                    {slots.length === 0 && (
                      <>
                        Pentru {partySize} {partySize === 1 ? "persoană" : "persoane"} rezervăm masa{" "}
                        {formatDuration(partyTurn)}.{" "}
                      </>
                    )}
                    La {reducedSlots.length > 1 ? "orele" : "ora"} de mai jos nu avem atât timp liber —
                    o poți rezerva pentru {formatDuration(reducedTurn)}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {reducedSlots.map((s) => (
                      <button
                        key={s} type="button" onClick={() => setTime(s)}
                        className={`px-3 h-11 rounded-xl border text-sm font-medium transition-colors ${
                          time === s ? "bg-accent text-white border-accent" : "border-hairline text-ink hover:border-accent/50"
                        }`}
                      >
                        <span className="tabular-nums">{s}</span>
                        <span className={`block text-[11px] leading-none ${time === s ? "text-white/80" : "text-faint"}`}>
                          până la {addMinutes(s, reducedTurn)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
              {isMember && hasSavedPhone && (
                <label className="flex items-center gap-2 text-xs text-muted mt-1 cursor-pointer">
                  <input type="checkbox" checked={updatePhone} onChange={(e) => setUpdatePhone(e.target.checked)} className="accent-accent" />
                  Actualizează numărul în cont pentru rezervări viitoare
                </label>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="guestEmail" className="font-medium text-ink text-sm">
              Email {isMember ? "(contul tău)" : "(opțional)"}
            </label>
            <input
              id="guestEmail" name="guestEmail" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              readOnly={isMember}
              aria-readonly={isMember}
              autoComplete="email"
              className={isMember ? `${inputClass} bg-black/[0.04] text-faint cursor-not-allowed` : inputClass}
            />
            {/* Members: the account email is fixed here (read-only). Guests can type one. */}
            {isMember ? (
              <span className="text-xs text-faint">
                Confirmarea rezervării ajunge pe adresa contului tău.
              </span>
            ) : confirmMode === "manual" && !willEmail ? (
              <span className="text-xs text-amber-700">
                Fără email, nu vei ști imediat dacă restaurantul acceptă rezervarea — vei fi contactat
                telefonic de un membru al echipei. Completează emailul ca să primești confirmarea automat.
              </span>
            ) : (
              <span className="text-xs text-faint">
                {confirmMode === "manual"
                  ? "Îți trimitem pe email confirmarea sau refuzul rezervării."
                  : "Îți trimitem confirmarea pe email dacă îl completezi."}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="note" className="font-medium text-ink text-sm">Mențiuni (opțional)</label>
            <textarea id="note" name="note" rows={2} className={inputClass} placeholder="Ex: masă la geam, scaun pentru copil…" />
          </div>

          {/* Newsletter opt-in — for anyone not already subscribed (guests + members).
              Single opt-in: subscribed immediately, a one-time welcome email acknowledges it. */}
          {!isSubscriber && (
            <div className="flex flex-col gap-1">
              <label className="flex items-start gap-2 text-sm text-ink bg-cream/40 border border-hairline rounded-lg px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={subscribePromo} onChange={(e) => setSubscribePromo(e.target.checked)} className="accent-accent mt-0.5" />
                <span>Vreau să fiu la curent cu Brașovul — evenimente din oraș și oferte de la localuri, direct pe email. Mă pot dezabona oricând.</span>
              </label>
              {subscribePromo && !isMember && !email && (
                <span className="text-xs text-amber-700">Adaugă emailul mai sus ca să te putem abona.</span>
              )}
            </div>
          )}

          {/* Honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          <p className="text-xs text-muted bg-cream/40 border border-hairline rounded-lg px-3 py-2 flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" aria-hidden />
            <span>
              Te rugăm să ajungi la timp. Dacă întârzii mai mult de 15 minute față de ora rezervării, aceasta poate fi anulată.
              {durationNote && <> {durationNote}</>}
            </span>
          </p>

          <button
            type="submit" disabled={loading}
            className="w-full bg-accent text-white font-semibold py-3 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {loading ? "Se trimite…" : confirmMode === "auto" ? "Rezervă masa" : "Trimite cererea de rezervare"}
          </button>
          {confirmMode === "manual" && (
            <p className="text-xs text-faint text-center">
              {willEmail
                ? "Rezervarea va fi confirmată de restaurant — primești un email cu răspunsul."
                : "Rezervarea va fi confirmată de restaurant telefonic."}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
