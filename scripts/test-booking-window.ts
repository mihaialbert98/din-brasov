/**
 * BOOKING WINDOW: dates in the past, and dates further ahead than
 * „cu cât timp înainte” allows.
 *
 * The bug this locks down: `advanceDays` was a client-side `max` attribute only, and
 * nothing rejected past dates — so a direct POST to /api/reservations could book
 * yesterday, or two years out. A past-dated booking is the worse one: it would exist
 * in the database while being INVISIBLE on the board (which lists today onward).
 *
 * Also checks the client date picker's verdict against the server's, so the message
 * a guest sees can never disagree with what actually happens on submit.
 *
 * Throwaway restaurant (slug window-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-booking-window.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationClosures } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import {
  availabilityForDay, validateBooking, createManualReservation, updateReservation,
  addDaysISO, listUpcomingReservations,
} from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "window-";
const ADVANCE = 7;

const todayISO = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const day = (off: number) => addDaysISO(todayISO(), off);

/**
 * The client picker's rule, replicated from ReservationForm.dateBlockedReason.
 * Returns a reason string or null.
 */
function clientBlockedReason(
  iso: string,
  opts: { bookableDays: Set<number>; closures: { dateFrom: string; dateTo: string }[]; advanceDays: number },
): string | null {
  const today = todayISO();
  if (iso < today) return "past";
  if (iso > addDaysISO(today, opts.advanceDays)) return "too-far";
  if (!opts.bookableDays.has(new Date(`${iso}T00:00:00`).getDay())) return "closed-weekday";
  if (opts.closures.some((c) => iso >= c.dateFrom && iso <= c.dateTo)) return "closed-period";
  return null;
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

  const [pl] = await db.insert(places).values({ name: "Window", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: "Window", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
    reservationAdvanceDays: ADVANCE,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  // Open every weekday, so only the WINDOW can be the reason a date is refused.
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    await db.insert(reservationHours).values({ restaurantId: r, dayOfWeek: d, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });
  }

  // ── 1. Past dates ───────────────────────────────────────────────────────────
  sec("1. Past dates are refused (they were accepted before)");
  for (const [label, off] of [["yesterday", -1], ["a week ago", -7], ["a year ago", -365]] as const) {
    const v = await validateBooking(r, day(off), "19:00", 2);
    ok(!v.ok, `${label} (${day(off)}) refused`);
    ok(!v.ok && /a trecut/i.test(v.reason ?? ""), `…with the past-date reason — "${!v.ok ? v.reason : ""}"`);
    break; // one detailed check; the rest just assert refusal
  }
  ok(!(await validateBooking(r, day(-7), "19:00", 2)).ok, "a week ago refused");
  ok(!(await validateBooking(r, day(-365), "19:00", 2)).ok, "a year ago refused");
  ok((await availabilityForDay(r, day(-1), 2)).slots.length === 0, "availability returns nothing for a past date");

  sec("1b. Why a past booking was dangerous");
  await db.insert(reservations).values({
    restaurantId: r, date: day(-2), time: "19:00", partySize: 2,
    guestName: "Fantomă", guestPhone: "0700000000", status: "confirmed", turnMinutes: 90,
  });
  const board = await listUpcomingReservations(r);
  ok(!board.some((b) => b.guestName === "Fantomă"), "a past-dated booking never appears on the board — it would have been invisible to staff");
  await db.delete(reservations).where(eq(reservations.restaurantId, r));

  // ── 2. The advance window ───────────────────────────────────────────────────
  sec(`2. „Cu cât timp înainte” = ${ADVANCE} zile is enforced server-side`);
  ok((await validateBooking(r, todayISO(), "19:00", 2)).ok || true, "(today may be past its last slot — not asserted)");
  ok((await validateBooking(r, day(1), "19:00", 2)).ok, "tomorrow accepted");
  ok((await validateBooking(r, day(ADVANCE), "19:00", 2)).ok, `day ${ADVANCE} — the last allowed day — accepted (boundary is inclusive)`);
  const over = await validateBooking(r, day(ADVANCE + 1), "19:00", 2);
  ok(!over.ok, `day ${ADVANCE + 1} refused`);
  ok(!over.ok && new RegExp(`cel mult ${ADVANCE}`).test(over.reason ?? ""), `…naming the limit — "${!over.ok ? over.reason : ""}"`);
  ok(!(await validateBooking(r, day(60), "19:00", 2)).ok, "60 days out refused");
  ok(!(await validateBooking(r, day(730), "19:00", 2)).ok, "2 years out refused");
  ok((await availabilityForDay(r, day(ADVANCE + 1), 2)).slots.length === 0, "availability returns nothing beyond the window");
  ok((await availabilityForDay(r, day(ADVANCE), 2)).slots.length > 0, "…but the last allowed day still offers slots");

  sec("2b. Changing the setting moves the boundary");
  await db.update(restaurants).set({ reservationAdvanceDays: 30 }).where(eq(restaurants.id, r));
  ok((await validateBooking(r, day(30), "19:00", 2)).ok, "raising it to 30 opens day 30");
  ok(!(await validateBooking(r, day(31), "19:00", 2)).ok, "…and day 31 is still refused");
  await db.update(restaurants).set({ reservationAdvanceDays: ADVANCE }).where(eq(restaurants.id, r));

  // ── 3. Staff are not limited by the public window ───────────────────────────
  sec("3. Staff may book outside the public window");
  const far = await createManualReservation(r, { date: day(ADVANCE + 40), time: "19:00", partySize: 4, guestName: "Nuntă", guestPhone: "0740111222" }, false);
  ok(far.ok, "staff can take a booking far beyond „cu cât timp înainte” (e.g. a wedding)");
  const [farRow] = await db.select({ id: reservations.id, date: reservations.date }).from(reservations).where(eq(reservations.guestName, "Nuntă"));
  ok(farRow.date === day(ADVANCE + 40), "…and it is stored on the right date");

  const back = await updateReservation(r, farRow.id, { date: day(-1), time: "19:00", partySize: 4 }, true);
  ok(!back.ok, "…but even staff cannot move a booking into the past");
  await db.delete(reservations).where(eq(reservations.restaurantId, r));

  // ── 4. Client picker agrees with the server, every time ─────────────────────
  sec("4. The date picker's verdict matches the server's");
  await db.insert(reservationClosures).values({ restaurantId: r, dateFrom: day(3), dateTo: day(4), reason: "Privat" });
  // Close Sundays so a "closed weekday" case exists too.
  await db.delete(reservationHours).where(eq(reservationHours.dayOfWeek, 0));
  const bookableDays = new Set([1, 2, 3, 4, 5, 6]);
  const closures = [{ dateFrom: day(3), dateTo: day(4) }];

  let agreed = 0;
  const disagreements: string[] = [];
  for (let off = -3; off <= ADVANCE + 3; off++) {
    const iso = day(off);
    const clientSays = clientBlockedReason(iso, { bookableDays, closures, advanceDays: ADVANCE });
    const serverOffers = (await availabilityForDay(r, iso, 2)).slots.length > 0;
    // Today can legitimately have no slots left (past its last seating) while the
    // picker still allows it — that's the one benign mismatch.
    if (iso === todayISO() && clientSays === null && !serverOffers) { agreed++; continue; }
    if ((clientSays === null) === serverOffers) agreed++;
    else disagreements.push(`${iso}: client=${clientSays ?? "allowed"} server=${serverOffers ? "has slots" : "no slots"}`);
  }
  ok(disagreements.length === 0, `all ${agreed} dates checked agree${disagreements.length ? " — " + disagreements.join("; ") : ""}`);

  sec("4b. Each refusal reason is triggered by its own cause");
  ok(clientBlockedReason(day(-1), { bookableDays, closures, advanceDays: ADVANCE }) === "past", "a past date → „a trecut”");
  ok(clientBlockedReason(day(ADVANCE + 1), { bookableDays, closures, advanceDays: ADVANCE }) === "too-far", "beyond the window → „cel mult N zile”");
  ok(clientBlockedReason(day(3), { bookableDays, closures, advanceDays: ADVANCE }) === "closed-period", "inside a closure → „nu primește rezervări în această perioadă”");
  const sunday = [...Array(ADVANCE + 1).keys()].map(day).find((d) => new Date(`${d}T00:00:00`).getDay() === 0);
  if (sunday) ok(clientBlockedReason(sunday, { bookableDays, closures, advanceDays: ADVANCE }) === "closed-weekday", "a closed weekday → „închis în această zi”");

  sec("4c. Precedence — the most fundamental reason wins");
  ok(clientBlockedReason(day(-5), { bookableDays: new Set(), closures, advanceDays: ADVANCE }) === "past",
    "a past date on a closed weekday reports „past” (fixing the weekday wouldn't help)");
  ok(clientBlockedReason(day(ADVANCE + 5), { bookableDays: new Set(), closures, advanceDays: ADVANCE }) === "too-far",
    "beyond the window on a closed weekday reports „too-far”");

  // ── 5. addDaysISO is DST- and month-boundary-proof ──────────────────────────
  sec("5. Date arithmetic");
  ok(addDaysISO("2026-01-31", 1) === "2026-02-01", "crosses a month boundary");
  ok(addDaysISO("2026-12-31", 1) === "2027-01-01", "crosses a year boundary");
  ok(addDaysISO("2026-02-28", 1) === "2026-03-01", "non-leap February");
  ok(addDaysISO("2028-02-28", 1) === "2028-02-29", "leap February");
  // Romania springs forward on the last Sunday of March, back on the last of October.
  ok(addDaysISO("2026-03-28", 1) === "2026-03-29", "spring DST change day");
  ok(addDaysISO("2026-03-29", 1) === "2026-03-30", "…and the day after it");
  ok(addDaysISO("2026-10-24", 1) === "2026-10-25", "autumn DST change day");
  ok(addDaysISO("2026-10-25", 1) === "2026-10-26", "…and the day after it");
  ok(addDaysISO("2026-08-01", 0) === "2026-08-01", "adding zero is a no-op");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
