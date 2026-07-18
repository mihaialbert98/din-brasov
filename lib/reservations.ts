import { db } from "@/lib/db";
import { restaurants, reservationHours, reservations, adminAuditLog, places } from "@/lib/db/schema";
import { eq, and, gte, ne, asc, inArray, isNull, sql } from "drizzle-orm";
import { sendAdminReservationSettingsChangedEmail } from "@/lib/email";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import type { Session } from "next-auth";

export type Area = "inside" | "outside";

export type ReservationHour = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  seatsPerSlot: number;
  seatsInside: number | null;
  seatsOutside: number | null;
};

/** Whether a restaurant splits reservations into interior/terasă areas. */
export async function areasEnabled(restaurantId: string): Promise<boolean> {
  const [r] = await db
    .select({ on: restaurants.reservationAreasEnabled })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return !!r?.on;
}

/**
 * Whether a restaurant can currently take public reservations: doubly gated
 * (admin grant + owner enable) AND has at least one bookable-hours window.
 */
export async function canReserve(restaurantId: string): Promise<boolean> {
  const [r] = await db
    .select({
      admin: restaurants.reservationsEnabledByAdmin,
      owner: restaurants.reservationsEnabledByOwner,
      status: restaurants.status,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!r || r.status !== "active" || !r.admin || !r.owner) return false;

  const [hour] = await db
    .select({ id: reservationHours.id })
    .from(reservationHours)
    .where(eq(reservationHours.restaurantId, restaurantId))
    .limit(1);
  return !!hour;
}

/** All bookable-hours rows for a restaurant (used by the form + server validation). */
export async function getReservationHours(restaurantId: string): Promise<ReservationHour[]> {
  return db
    .select({
      id: reservationHours.id,
      dayOfWeek: reservationHours.dayOfWeek,
      startTime: reservationHours.startTime,
      endTime: reservationHours.endTime,
      slotMinutes: reservationHours.slotMinutes,
      seatsPerSlot: reservationHours.seatsPerSlot,
      seatsInside: reservationHours.seatsInside,
      seatsOutside: reservationHours.seatsOutside,
    })
    .from(reservationHours)
    .where(eq(reservationHours.restaurantId, restaurantId));
}

/**
 * When a PLATFORM ADMIN (not the owner) changes a restaurant's reservation config,
 * write an audit-log row and email the acting admin a confirmation. No-op for owners.
 */
export async function auditAdminReservationChange(
  session: Session | null,
  role: string | undefined,
  restaurantId: string,
  change: string
): Promise<void> {
  if (!isPlatformStaff(role) || !session?.user?.id) return;

  const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const restaurantName = r?.name ?? "Restaurant";

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "edit_reservation_settings",
    entityType: "restaurant",
    entityId: restaurantId,
    metadataJson: JSON.stringify({ change }),
  });

  const email = session.user.email;
  if (email) {
    await sendAdminReservationSettingsChangedEmail(email, {
      adminName: session.user.name ?? "Administrator",
      restaurantName,
      change,
    }).catch(() => {});
  }
}

/** The single-party cap for a restaurant (independent of per-slot seat capacity). */
export async function getMaxPartySize(restaurantId: string): Promise<number> {
  const [r] = await db
    .select({ cap: restaurants.reservationMaxPartySize })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return r?.cap ?? 12;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The seat capacity of a window for the given area (or single capacity when null). */
function windowCapacity(h: ReservationHour, area?: Area): number {
  if (area === "inside") return h.seatsInside ?? 0;
  if (area === "outside") return h.seatsOutside ?? 0;
  return h.seatsPerSlot;
}

/**
 * Every selectable "HH:MM" slot on one day, each with the seat capacity of the
 * window it belongs to (for the given area, or single capacity). Overlapping
 * windows: the larger capacity wins.
 */
export function slotsWithCapacity(hours: ReservationHour[], area?: Area): Map<string, number> {
  const caps = new Map<string, number>();
  for (const h of hours) {
    const start = toMinutes(h.startTime);
    const end = toMinutes(h.endTime);
    const step = h.slotMinutes > 0 ? h.slotMinutes : 30;
    const cap = windowCapacity(h, area);
    for (let t = start; t <= end - step; t += step) {
      const key = toHHMM(t);
      caps.set(key, Math.max(caps.get(key) ?? 0, cap));
    }
  }
  return caps;
}

/** Plain sorted list of a day's slot times (no capacity). */
export function slotsForDay(hours: ReservationHour[]): string[] {
  return [...slotsWithCapacity(hours).keys()].sort();
}

/**
 * Live availability for a date + party size (+ optional area): for each of the
 * day's slots, subtract the seats already taken (pending + confirmed, IN THAT AREA
 * when given) and return only slots with room for this party.
 */
export async function availableSlotsForDay(
  restaurantId: string,
  dateStr: string,
  partySize: number,
  area?: Area,
): Promise<string[]> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (hours.length === 0) return [];

  const caps = slotsWithCapacity(hours, area);

  const booked = await db
    .select({ time: reservations.time, partySize: reservations.partySize, area: reservations.area })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
      )
    );

  const taken = new Map<string, number>();
  for (const b of booked) {
    // When an area is requested, only bookings in the same area consume its seats.
    if (area && b.area !== area) continue;
    taken.set(b.time, (taken.get(b.time) ?? 0) + b.partySize);
  }

  return [...caps.entries()]
    .filter(([time, cap]) => cap - (taken.get(time) ?? 0) >= partySize)
    .map(([time]) => time)
    .sort();
}

/**
 * For one time, which areas still have room for the party — powers the
 * "the other area is free at this hour" hint. Only meaningful when areas are on.
 */
export async function slotAreaAvailability(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
): Promise<{ inside: boolean; outside: boolean }> {
  const [inside, outside] = await Promise.all([
    availableSlotsForDay(restaurantId, dateStr, partySize, "inside"),
    availableSlotsForDay(restaurantId, dateStr, partySize, "outside"),
  ]);
  return { inside: inside.includes(time), outside: outside.includes(time) };
}

/**
 * Server-side validity check at booking time (re-checked to prevent oversell):
 * party within the restaurant cap, and the slot has enough seats for this party in
 * the chosen area (or single capacity when areas are off).
 */
export async function validateBooking(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number,
  area?: Area,
): Promise<{ ok: boolean; reason?: string }> {
  const cap = await getMaxPartySize(restaurantId);
  if (partySize < 1 || partySize > cap) {
    return { ok: false, reason: `Numărul de persoane trebuie să fie între 1 și ${cap}.` };
  }
  // When areas are on, an area is required.
  if (await areasEnabled(restaurantId)) {
    if (area !== "inside" && area !== "outside") {
      return { ok: false, reason: "Alege zona (interior sau terasă)." };
    }
  }
  const available = await availableSlotsForDay(restaurantId, dateStr, partySize, area);
  if (!available.includes(time)) {
    return { ok: false, reason: "Ora selectată nu mai este disponibilă. Alege altă oră." };
  }
  return { ok: true };
}

/**
 * Staff-created reservation (someone called). Confirmed immediately. Respects the
 * slot's remaining seats unless `force` is set (staff know the real floor). Returns
 * the seats remaining before insert so the caller can warn on an override.
 */
export async function createManualReservation(
  restaurantId: string,
  input: { date: string; time: string; partySize: number; guestName: string; guestPhone: string; note?: string; area?: Area },
  force: boolean,
): Promise<{ ok: true } | { ok: false; reason: string; overridable?: boolean }> {
  if (input.partySize < 1) return { ok: false, reason: "Număr de persoane invalid." };

  const withAreas = await areasEnabled(restaurantId);
  const area = withAreas ? input.area : undefined;
  if (withAreas && area !== "inside" && area !== "outside") {
    return { ok: false, reason: "Alege zona (interior sau terasă)." };
  }

  // Slot must exist in the day's hours (even a forced booking needs a real time).
  const day = new Date(`${input.date}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  const caps = slotsWithCapacity(hours, area);
  if (!caps.has(input.time)) {
    return { ok: false, reason: "Ora nu este într-un interval de program." };
  }

  // Seats check — unless forced.
  if (!force) {
    const available = await availableSlotsForDay(restaurantId, input.date, input.partySize, area);
    if (!available.includes(input.time)) {
      return { ok: false, reason: "Slotul este plin pentru acest număr de persoane.", overridable: true };
    }
  }

  await db.insert(reservations).values({
    restaurantId,
    date: input.date,
    time: input.time,
    partySize: input.partySize,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: null,
    area: area ?? null,
    status: "confirmed", // staff take it live → already confirmed
    note: input.note || null,
  });
  return { ok: true };
}

/** Upcoming reservations for the board (today onward, excluding declined). */
export async function listUpcomingReservations(restaurantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select({
      id: reservations.id,
      date: reservations.date,
      time: reservations.time,
      partySize: reservations.partySize,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
      guestEmail: reservations.guestEmail,
      status: reservations.status,
      area: reservations.area,
      note: reservations.note,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .where(and(eq(reservations.restaurantId, restaurantId), gte(reservations.date, today), ne(reservations.status, "declined")))
    .orderBy(asc(reservations.date), asc(reservations.time));
}

/**
 * Set a reservation's status (confirmed | declined | cancelled) after verifying it
 * belongs to the given restaurant. No guest email is sent — the restaurant contacts
 * the guest by phone. Returns false if the reservation isn't found.
 */
export async function setReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: "confirmed" | "declined" | "cancelled",
): Promise<boolean> {
  const [res] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  if (!res) return false;

  await db
    .update(reservations)
    .set({ status, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));
  return true;
}

/**
 * Link anonymous reservations to a newly-created/confirmed account by matching the
 * booking's guest email to the account's (verified) email. Called on signup/confirm
 * so a table booked while logged out shows up in the user's account. Case-insensitive;
 * only touches rows with no userId yet. Best-effort.
 */
export async function linkAnonReservations(userId: string, email: string): Promise<void> {
  await db
    .update(reservations)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        sql`lower(${reservations.guestEmail}) = ${email.toLowerCase()}`,
        isNull(reservations.userId),
      )
    );
}

/**
 * A user cancels their OWN reservation. Verifies the reservation belongs to the
 * user and is still cancellable (pending/confirmed). Cancelling frees the seats
 * (availability counts only pending+confirmed). Returns the place slug so the UI
 * can offer "cancel & rebook".
 */
export async function cancelOwnReservation(
  userId: string,
  reservationId: string,
): Promise<{ ok: true; placeSlug: string | null } | { ok: false; reason: string }> {
  const [res] = await db
    .select({ id: reservations.id, status: reservations.status, restaurantId: reservations.restaurantId })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.userId, userId)))
    .limit(1);
  if (!res) return { ok: false, reason: "Rezervare negăsită." };
  if (res.status !== "pending" && res.status !== "confirmed") {
    return { ok: false, reason: "Rezervarea nu mai poate fi anulată." };
  }

  await db
    .update(reservations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  // The linked place slug (for the rebook link).
  const [r] = await db
    .select({ placeId: restaurants.placeId })
    .from(restaurants)
    .where(eq(restaurants.id, res.restaurantId))
    .limit(1);
  let placeSlug: string | null = null;
  if (r?.placeId) {
    const [p] = await db.select({ slug: places.slug }).from(places).where(eq(places.id, r.placeId)).limit(1);
    placeSlug = p?.slug ?? null;
  }
  return { ok: true, placeSlug };
}
