/**
 * Closed dates — the owner marks a day (or a range) as taking no ONLINE bookings.
 *
 * Proves:
 *   - a closed date offers nothing to clients and can't be booked through the public gate
 *   - staff CAN still add/edit a booking on it, but only after confirming (overridable)
 *   - reservations that already exist on a closed date are completely untouched
 *   - the closure is a date RANGE, inclusive at both ends, and only affects its own days
 *   - reopening restores availability exactly
 *   - the public day-picker rule (isClosedOn) matches the server gate
 *
 * Throwaway restaurant (slug closr-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-closures.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationClosures } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availabilityForDay, validateBooking, createManualReservation, updateReservation, getClosures, isClosedOn } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "closr-";

/** The next `n`th occurrence of a weekday, as YYYY-MM-DD. */
function dateForDow(dow: number, skip = 0): string {
  const d = new Date();
  let seen = 0;
  // 70 days covers the 6th occurrence of a weekday with room to spare.
  for (let i = 1; i <= 70; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    const iso = t.toISOString().slice(0, 10);
    if (new Date(iso + "T00:00:00").getDay() === dow) {
      if (seen === skip) return iso;
      seen++;
    }
  }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationClosures).where(inArray(reservationClosures.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 2;
  const week1 = dateForDow(dow, 0); // the day we'll close
  const week2 = dateForDow(dow, 1); // the same weekday, a week later — must stay open

  const [pl] = await db.insert(places).values({ name: "Closr", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "Closr", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 20,
    reservationAdvanceDays: 60,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });

  sec("1. Before closing, the day is bookable");
  ok((await availabilityForDay(r.id, week1, 2)).slots.includes("19:00"), "19:00 offered on the open day");
  ok((await validateBooking(r.id, week1, "19:00", 2)).ok, "the public booking gate accepts it");

  sec("2. An existing reservation is placed, THEN the day is closed");
  const [existing] = await db.insert(reservations).values({
    restaurantId: r.id, date: week1, time: "19:00", partySize: 4,
    guestName: "Ion", guestPhone: "0700111222", status: "confirmed", turnMinutes: 90,
  }).returning({ id: reservations.id });
  await db.insert(reservationClosures).values({ restaurantId: r.id, dateFrom: week1, dateTo: week1, reason: "Eveniment privat" });

  const after = await availabilityForDay(r.id, week1, 2);
  ok(after.slots.length === 0 && after.reducedSlots.length === 0, `closed day offers NO slots — got ${after.slots.length}`);
  const gate = await validateBooking(r.id, week1, "19:00", 2);
  ok(!gate.ok, "the public booking gate refuses a closed day");
  ok(/nu primește rezervări în această zi/i.test(gate.reason ?? ""), `…with a clear reason — "${gate.reason}"`);

  const [untouched] = await db.select().from(reservations).where(eq(reservations.id, existing.id));
  ok(untouched.status === "confirmed" && untouched.time === "19:00" && untouched.partySize === 4,
    "the reservation that already existed on that day is completely untouched");

  sec("3. Only the closed date is affected");
  ok((await availabilityForDay(r.id, week2, 2)).slots.includes("19:00"), "the same weekday NEXT week is still fully bookable");

  sec("4. Staff may still book a closed day — but must confirm");
  const blocked = await createManualReservation(r.id, { date: week1, time: "20:00", partySize: 2, guestName: "Maria", guestPhone: "0700333444" }, false);
  ok(!blocked.ok, "an unforced staff booking on a closed day is refused");
  ok(!blocked.ok && blocked.overridable === true, "…and it is flagged overridable (the modal offers „salvează oricum”)");
  ok(!blocked.ok && /închisă/i.test(blocked.reason), `…with the closed-day reason — "${!blocked.ok ? blocked.reason : ""}"`);

  const forced = await createManualReservation(r.id, { date: week1, time: "20:00", partySize: 2, guestName: "Maria", guestPhone: "0700333444" }, true);
  ok(forced.ok, "forcing it through succeeds (private event, phone booking)");
  const onClosedDay = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.date, week1));
  ok(onClosedDay.length === 2, "both bookings now exist on the closed day");

  sec("5. Editing a booking INTO a closed day is overridable too");
  const moved = await updateReservation(r.id, existing.id, { date: week1, time: "18:00", partySize: 4 }, false);
  ok(!moved.ok && moved.overridable === true, "moving a booking onto a closed day warns but can be overridden");
  const movedForced = await updateReservation(r.id, existing.id, { date: week1, time: "18:00", partySize: 4 }, true);
  ok(movedForced.ok, "…and forcing it through works");

  sec("6. Ranges are inclusive at both ends");
  const from = dateForDow(dow, 2);
  const to = dateForDow(dow, 4);
  await db.insert(reservationClosures).values({ restaurantId: r.id, dateFrom: from, dateTo: to, reason: "Concediu" });
  const closures = await getClosures(r.id);
  ok(closures.length === 2, "both closures are listed");
  ok(isClosedOn(from, closures), "the FIRST day of the range is closed (inclusive start)");
  ok(isClosedOn(to, closures), "the LAST day of the range is closed (inclusive end)");
  ok(isClosedOn(dateForDow(dow, 3), closures), "a day in the middle of the range is closed");
  ok(!isClosedOn(dateForDow(dow, 5), closures), "the day after the range is open");
  ok((await availabilityForDay(r.id, from, 2)).slots.length === 0, "the server agrees: the range's first day offers nothing");
  ok((await availabilityForDay(r.id, dateForDow(dow, 5), 2)).slots.length > 0, "…and the day after it is bookable");

  sec("7. isClosedOn (the client day-picker rule) matches the server gate");
  for (const d of [week1, week2, from, to, dateForDow(dow, 5)]) {
    const clientSaysClosed = isClosedOn(d, closures);
    const serverOffersNothing = (await availabilityForDay(r.id, d, 2)).slots.length === 0;
    ok(clientSaysClosed === serverOffersNothing, `${d}: client picker and server agree (closed=${clientSaysClosed})`);
  }

  sec("8. Reopening restores availability exactly");
  await db.delete(reservationClosures).where(eq(reservationClosures.restaurantId, r.id));
  const reopened = await availabilityForDay(r.id, week1, 2);
  ok(reopened.slots.includes("17:00"), "after deleting the closure the day is bookable again");
  ok((await validateBooking(r.id, week1, "17:00", 2)).ok, "…and the public gate accepts bookings once more");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
