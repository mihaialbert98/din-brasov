/**
 * SETTINGS GUARDS: the owner must never be able to silently switch OFF online
 * bookings, or destroy something reversible, without being told.
 *
 * Three states that used to be silent:
 *   1. every table held back for walk-ins  → clients see nothing, no warning
 *   2. every table deactivated             → clients see nothing, no warning
 *   3. deleting an interval that has bookings inside it → no warning at all
 *
 * For 1 & 2 this replicates the tables manager's warning condition and pairs it with
 * the real client-side availability, so the warning can never disagree with reality.
 * For 3 it replicates the DELETE route's guard.
 *
 * Also re-checks that these guards did NOT make legitimate states noisy — a normal
 * room, or holding back only SOME tables, must stay silent.
 *
 * Throwaway restaurants (slug guard-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-settings-guards.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { availabilityForDay, canReserve, bookingsInHoursWindow } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "guard-";

type Row = { isActive: boolean; bookableOnline: boolean };

/**
 * The tables manager's warning, replicated exactly. Returns which message the owner
 * sees, or null when the panel stays quiet.
 */
function ownerWarning(tables: Row[]): "no-tables" | "all-inactive" | "all-held" | null {
  const active = tables.filter((t) => t.isActive);
  const online = active.filter((t) => t.bookableOnline);
  if (online.length > 0) return null;
  if (tables.length === 0) return "no-tables";
  if (active.length === 0) return "all-inactive";
  return "all-held";
}

function dateForDow(dow: number): string {
  for (let i = 1; i <= 8; i++) {
    const t = new Date();
    t.setDate(t.getDate() + i);
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (new Date(iso + "T00:00:00").getDay() === dow) return iso;
  }
  return "";
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);

  // ── Pure: the warning covers every combination ──────────────────────────────
  sec("1. The warning condition itself");
  ok(ownerWarning([]) === "no-tables", "no tables at all → „adaugă o masă”");
  ok(ownerWarning([{ isActive: false, bookableOnline: true }]) === "all-inactive", "all deactivated → „activează o masă”");
  ok(ownerWarning([{ isActive: true, bookableOnline: false }]) === "all-held", "all held for walk-in → „redă online”");
  ok(ownerWarning([{ isActive: false, bookableOnline: false }, { isActive: false, bookableOnline: true }]) === "all-inactive",
    "deactivated wins when a table is both deactivated AND held (activate it first)");
  ok(ownerWarning([{ isActive: true, bookableOnline: true }]) === null, "one bookable table → no warning");
  ok(ownerWarning([{ isActive: true, bookableOnline: true }, { isActive: true, bookableOnline: false }]) === null,
    "holding back SOME tables is the normal case → stays silent");
  ok(ownerWarning([{ isActive: true, bookableOnline: true }, { isActive: false, bookableOnline: true }]) === null,
    "deactivating SOME tables → stays silent");

  // ── The warning must agree with what clients actually get ───────────────────
  sec("2. The warning never disagrees with the client's view");
  const [pl] = await db.insert(places).values({ name: "Guard", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: "Guard", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  await db.insert(reservationHours).values({ restaurantId: r, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });
  const t1 = (await db.insert(reservationTables).values({ restaurantId: r, label: "M1", seats: 4 }).returning({ id: reservationTables.id }))[0].id;
  const t2 = (await db.insert(reservationTables).values({ restaurantId: r, label: "M2", seats: 4 }).returning({ id: reservationTables.id }))[0].id;

  const state = async () => (await db.select({ isActive: reservationTables.isActive, bookableOnline: reservationTables.bookableOnline }).from(reservationTables).where(eq(reservationTables.restaurantId, r))) as Row[];
  const clientSlots = async () => (await availabilityForDay(r, date, 2)).slots.length;

  ok(ownerWarning(await state()) === null && (await clientSlots()) > 0, "healthy room: no warning, clients can book");

  await db.update(reservationTables).set({ bookableOnline: false }).where(eq(reservationTables.id, t1));
  ok(ownerWarning(await state()) === null && (await clientSlots()) > 0, "one table held back: still no warning, clients still book");

  await db.update(reservationTables).set({ bookableOnline: false }).where(eq(reservationTables.id, t2));
  ok((await clientSlots()) === 0, "ALL held back → clients get zero slots");
  ok(ownerWarning(await state()) === "all-held", "…and the owner is now warned (this was silent before)");
  ok(await canReserve(r), "…while the public „Rezervă o masă” button is still shown — which is exactly why the warning matters");

  await db.update(reservationTables).set({ bookableOnline: true, isActive: false }).where(eq(reservationTables.restaurantId, r));
  ok((await clientSlots()) === 0, "ALL deactivated → clients get zero slots");
  ok(ownerWarning(await state()) === "all-inactive", "…and the owner is warned");

  await db.update(reservationTables).set({ isActive: true }).where(eq(reservationTables.id, t1));
  ok(ownerWarning(await state()) === null && (await clientSlots()) > 0, "reactivating one table clears the warning and restores booking");

  // ── Interval delete guard ───────────────────────────────────────────────────
  sec("3. Deleting an interval that has bookings");
  const [h2] = await db.insert(reservationHours).values({
    restaurantId: r, dayOfWeek: dow, startTime: "12:00", endTime: "15:00", slotMinutes: 30, seatsPerSlot: 20,
  }).returning({ id: reservationHours.id });
  const [hDinner] = await db.select({ id: reservationHours.id }).from(reservationHours)
    .where(and(eq(reservationHours.restaurantId, r), eq(reservationHours.startTime, "17:00")));

  ok((await bookingsInHoursWindow(r, h2.id))?.length === 0, "an empty interval reports nothing → deletes without a prompt");

  // A lunch booking (12:30) and a dinner booking (19:00) on the same weekday.
  await db.insert(reservations).values([
    { restaurantId: r, date, time: "12:30", partySize: 2, guestName: "Prânz", guestPhone: "0740 111 111", status: "confirmed", turnMinutes: 90 },
    { restaurantId: r, date, time: "19:00", partySize: 2, guestName: "Cină", guestPhone: "0740 222 222", status: "confirmed", turnMinutes: 90 },
  ]);

  const lunch = await bookingsInHoursWindow(r, h2.id);
  ok(lunch?.length === 1 && lunch[0].guestName === "Prânz", "the lunch interval reports ONLY the lunch booking (split shifts don't bleed)");
  ok(!!lunch?.[0].guestPhone, "…with a phone number, so the owner can call");

  const dinner = await bookingsInHoursWindow(r, hDinner.id);
  ok(dinner?.length === 1 && dinner[0].guestName === "Cină", "the dinner interval reports only the dinner booking");

  sec("3b. Boundaries and scope");
  await db.insert(reservations).values([
    { restaurantId: r, date, time: "12:00", partySize: 2, guestName: "Exact-start", guestPhone: "0740 333 333", status: "confirmed", turnMinutes: 90 },
    { restaurantId: r, date, time: "15:00", partySize: 2, guestName: "Exact-end", guestPhone: "0740 444 444", status: "confirmed", turnMinutes: 90 },
  ]);
  const names = (await bookingsInHoursWindow(r, h2.id))!.map((b) => b.guestName);
  ok(names.includes("Exact-start"), "a booking at the interval's first minute counts");
  ok(names.includes("Exact-end"), "…and one at the last seating time counts (the window is end-inclusive)");

  // Cancelled/declined bookings must not trigger the prompt.
  await db.insert(reservations).values({ restaurantId: r, date, time: "13:00", partySize: 2, guestName: "Anulat", guestPhone: "0740 555 555", status: "cancelled", turnMinutes: 90 });
  ok(!(await bookingsInHoursWindow(r, h2.id))!.some((b) => b.guestName === "Anulat"), "cancelled bookings are ignored");

  // Past bookings must not block a cleanup of an old interval.
  await db.insert(reservations).values({ restaurantId: r, date: "2020-01-02", time: "13:00", partySize: 2, guestName: "Trecut", guestPhone: "0740 666 666", status: "confirmed", turnMinutes: 90 });
  ok(!(await bookingsInHoursWindow(r, h2.id))!.some((b) => b.guestName === "Trecut"), "past bookings are ignored — only future ones prompt");

  ok((await bookingsInHoursWindow(r, "does-not-exist")) === null, "an unknown interval id returns null → the route answers 404");

  sec("3c. Deleting does not cancel the bookings");
  const before = (await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.restaurantId, r))).length;
  await db.delete(reservationHours).where(eq(reservationHours.id, h2.id)); // the forced path
  const after = await db.select({ id: reservations.id, status: reservations.status }).from(reservations).where(eq(reservations.restaurantId, r));
  ok(after.length === before, "every booking still exists after the interval is deleted");
  ok(after.filter((b) => b.status === "confirmed").length === before - 1, "…and none were cancelled (only the pre-existing cancelled one is not confirmed)");
  ok((await availabilityForDay(r, date, 2)).slots.every((s) => s >= "17:00"), "only FUTURE availability changed — the lunch window is gone");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
