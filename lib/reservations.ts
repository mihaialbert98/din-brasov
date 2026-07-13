import { db } from "@/lib/db";
import { restaurants, reservationHours, reservations, adminAuditLog } from "@/lib/db/schema";
import { eq, and, gte, ne, asc, inArray } from "drizzle-orm";
import { sendAdminReservationSettingsChangedEmail } from "@/lib/email";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import type { Session } from "next-auth";

export type ReservationHour = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  seatsPerSlot: number;
};

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

/**
 * Every selectable "HH:MM" slot on one day, each with the seat capacity of the
 * window it belongs to. If windows overlap, the larger capacity wins for that slot.
 */
export function slotsWithCapacity(hours: ReservationHour[]): Map<string, number> {
  const caps = new Map<string, number>();
  for (const h of hours) {
    const start = toMinutes(h.startTime);
    const end = toMinutes(h.endTime);
    const step = h.slotMinutes > 0 ? h.slotMinutes : 30;
    for (let t = start; t <= end - step; t += step) {
      const key = toHHMM(t);
      caps.set(key, Math.max(caps.get(key) ?? 0, h.seatsPerSlot));
    }
  }
  return caps;
}

/** Plain sorted list of a day's slot times (no capacity). */
export function slotsForDay(hours: ReservationHour[]): string[] {
  return [...slotsWithCapacity(hours).keys()].sort();
}

/**
 * Live availability for a date + party size: for each of the day's slots, subtract
 * the seats already taken (pending + confirmed) and return only slots that still
 * have room for this party. Full/insufficient slots are omitted — they "disappear".
 */
export async function availableSlotsForDay(
  restaurantId: string,
  dateStr: string,
  partySize: number
): Promise<string[]> {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  if (hours.length === 0) return [];

  const caps = slotsWithCapacity(hours);

  // Seats already booked per slot on that date (pending + confirmed hold seats).
  const booked = await db
    .select({
      time: reservations.time,
      partySize: reservations.partySize,
      status: reservations.status,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.date, dateStr),
        inArray(reservations.status, ["pending", "confirmed"]),
      )
    );

  const taken = new Map<string, number>();
  for (const b of booked) taken.set(b.time, (taken.get(b.time) ?? 0) + b.partySize);

  return [...caps.entries()]
    .filter(([time, cap]) => cap - (taken.get(time) ?? 0) >= partySize)
    .map(([time]) => time)
    .sort();
}

/**
 * Server-side validity check at booking time (re-checked to prevent oversell):
 * the slot must be within the day's hours, the party within the restaurant cap,
 * and the slot must still have enough seats for this party.
 */
export async function validateBooking(
  restaurantId: string,
  dateStr: string,
  time: string,
  partySize: number
): Promise<{ ok: boolean; reason?: string }> {
  const cap = await getMaxPartySize(restaurantId);
  if (partySize < 1 || partySize > cap) {
    return { ok: false, reason: `Numărul de persoane trebuie să fie între 1 și ${cap}.` };
  }
  const available = await availableSlotsForDay(restaurantId, dateStr, partySize);
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
  input: { date: string; time: string; partySize: number; guestName: string; guestPhone: string; note?: string },
  force: boolean,
): Promise<{ ok: true } | { ok: false; reason: string; overridable?: boolean }> {
  if (input.partySize < 1) return { ok: false, reason: "Număr de persoane invalid." };

  // Slot must exist in the day's hours (even a forced booking needs a real time).
  const day = new Date(`${input.date}T00:00:00`).getDay();
  const hours = (await getReservationHours(restaurantId)).filter((h) => h.dayOfWeek === day);
  const caps = slotsWithCapacity(hours);
  if (!caps.has(input.time)) {
    return { ok: false, reason: "Ora nu este într-un interval de program." };
  }

  // Seats check — unless forced.
  if (!force) {
    const available = await availableSlotsForDay(restaurantId, input.date, input.partySize);
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
