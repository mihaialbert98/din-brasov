/**
 * Reservation primitives shared by the availability engine (lib/reservations.ts) and the
 * floor plan (lib/floor-plan.ts).
 *
 * Extracted purely to keep the dependency one-directional: floor-plan needs the turn
 * rules and the time helpers, and reservations needs floor-plan at the two points where a
 * booking is written. Importing each other would make that a cycle. Everything here is
 * either pure or a single settings read — no availability logic lives in this file, and
 * lib/reservations.ts re-exports the public names so existing importers are unaffected.
 */
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type CapacityMode = "seats" | "tables";

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Reservations are wall-clock local to the venue (Brașov). "Today" and past-slot
// checks must use THIS timezone, never the server's UTC — otherwise the small hours
// roll the date (the same class of bug the booking form's date chips had).
const RESERVATION_TZ = "Europe/Bucharest";

/** Current { date: "YYYY-MM-DD", minutes: since local midnight } in the venue TZ. */
export function nowInReservationTZ(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESERVATION_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some ICU builds render local midnight as "24"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + parseInt(get("minute"), 10) };
}

/** Parse a JSON array of table ids into a string[] (empty on null/bad). Pure. */
export function parseTableIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type ReservationConfig = {
  mode: CapacityMode;
  maxJoin: number;
  advanceDays: number;
  /** Standard turn (minutes) — how long an ordinary booking holds its seats. */
  turn: number;
  /** Optional longer turn for big parties. `minutes` is never below `turn`. */
  longTurn: { enabled: boolean; fromParty: number; minutes: number };
  allowReducedTurn: boolean;
  showDuration: boolean;
  /** Auto-confirm only: whether the success screen mentions the confirmation email. */
  showEmailNotice: boolean;
};

/** Restaurant-level reservation config that drives which capacity model to use. */
export async function getReservationConfig(restaurantId: string): Promise<ReservationConfig> {
  const [r] = await db
    .select({
      mode: restaurants.reservationCapacityMode,
      maxJoin: restaurants.reservationMaxJoin,
      advanceDays: restaurants.reservationAdvanceDays,
      turn: restaurants.reservationTurnMinutes,
      longEnabled: restaurants.reservationLongTurnEnabled,
      longFrom: restaurants.reservationLongTurnFromParty,
      longMinutes: restaurants.reservationLongTurnMinutes,
      allowReduced: restaurants.reservationAllowReducedTurn,
      showDuration: restaurants.reservationShowDuration,
      showEmailNotice: restaurants.reservationShowEmailNotice,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const turn = r?.turn && r.turn > 0 ? r.turn : 90;
  return {
    mode: r?.mode === "tables" ? "tables" : "seats",
    maxJoin: r?.maxJoin && r.maxJoin > 0 ? r.maxJoin : 2,
    advanceDays: r?.advanceDays && r.advanceDays > 0 ? r.advanceDays : 60,
    turn,
    longTurn: {
      enabled: !!r?.longEnabled,
      fromParty: r?.longFrom && r.longFrom > 1 ? r.longFrom : 6,
      // Clamped so a misconfigured "long" turn shorter than the standard one can't
      // invert the rule (the reduced-turn fallback assumes long ≥ standard).
      minutes: Math.max(turn, r?.longMinutes && r.longMinutes > 0 ? r.longMinutes : 120),
    },
    allowReducedTurn: r?.allowReduced ?? true,
    showDuration: !!r?.showDuration,
    showEmailNotice: r?.showEmailNotice ?? true,
  };
}

/** How long a booking of this size holds the table, per the restaurant's rules. Pure. */
export function turnFor(partySize: number, cfg: ReservationConfig): number {
  return cfg.longTurn.enabled && partySize >= cfg.longTurn.fromParty ? cfg.longTurn.minutes : cfg.turn;
}
