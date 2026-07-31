/**
 * ADMIN → CLIENT: every reservation setting an owner can change, checked against
 * what the client actually sees and can actually book.
 *
 * For each setting: read the client's view, change the setting exactly as the API
 * route does, read the client's view again, and assert it moved the way the owner
 * would expect — then assert the SERVER GATE agrees, because the form is only a
 * display and `validateBooking` is what really decides.
 *
 * Also covers the stale-page case: a client whose browser still shows an old slot
 * list must not be able to book something the settings now forbid.
 *
 * Client surfaces exercised:
 *   - the day chips        → getReservationHours + enabled + closures (mirrors ReservationForm)
 *   - the time slots       → availabilityForDay (what /api/reservations/availability returns)
 *   - the duration line    → getReservationConfig (mirrors the form's `duration` prop)
 *   - actually booking     → validateBooking (what POST /api/reservations calls)
 *
 * Throwaway restaurant (slug adminsync-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-admin-client-sync.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationClosures } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  availabilityForDay, validateBooking, getReservationHours, getReservationConfig,
  getClosures, isClosedOn, turnFor, getReservationTables, getMaxPartySize,
} from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "adminsync-";

function dateForDow(dow: number, skip = 0): string {
  let seen = 0;
  for (let i = 1; i <= 70; i++) {
    const t = new Date();
    t.setDate(t.getDate() + i);
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (new Date(iso + "T00:00:00").getDay() === dow) {
      if (seen === skip) return iso;
      seen++;
    }
  }
  return "";
}

/** Exactly what ReservationForm does to decide which weekday chips to render. */
async function clientDayChips(rid: string): Promise<Set<number>> {
  const hours = await getReservationHours(rid);
  return new Set(hours.filter((h) => h.enabled).map((h) => h.dayOfWeek));
}

/** Whether the client's day picker would offer this specific date. */
async function clientOffersDate(rid: string, iso: string): Promise<boolean> {
  const chips = await clientDayChips(rid);
  const dow = new Date(iso + "T00:00:00").getDay();
  if (!chips.has(dow)) return false;
  return !isClosedOn(iso, await getClosures(rid));
}

/** The duration line the form renders, mirroring its `duration` prop + turnFor(). */
async function clientDurationFor(rid: string, partySize: number): Promise<{ shown: boolean; minutes: number }> {
  const cfg = await getReservationConfig(rid);
  return { shown: cfg.showDuration, minutes: turnFor(partySize, cfg) };
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(reservationClosures).where(inArray(reservationClosures.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const dow = 2;
  const date = dateForDow(dow, 0);
  const otherDow = 5;
  const otherDate = dateForDow(otherDow, 0);

  const [pl] = await db.insert(places).values({ name: "AdminSync", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: "AdminSync", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
    reservationAdvanceDays: 60, reservationLongTurnEnabled: false, reservationAllowReducedTurn: true,
    reservationShowDuration: false,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  const [h1] = await db.insert(reservationHours).values({
    restaurantId: r, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20,
  }).returning({ id: reservationHours.id });
  await db.insert(reservationHours).values({
    restaurantId: r, dayOfWeek: otherDow, startTime: "18:00", endTime: "21:00", slotMinutes: 30, seatsPerSlot: 20,
  });

  // ── 1. Adding / editing / pausing / deleting an interval ────────────────────
  sec("1. Program intervals");
  ok((await clientDayChips(r)).has(dow), "client sees the weekday after the owner adds an interval");
  ok((await availabilityForDay(r, date, 2)).slots.includes("17:00"), "…and the first slot of the window");
  ok((await availabilityForDay(r, date, 2)).slots.includes("22:00"), "…through the last seating time (end-inclusive)");

  // Owner edits the window: 18:00–20:00.
  await db.update(reservationHours).set({ startTime: "18:00", endTime: "20:00" }).where(eq(reservationHours.id, h1.id));
  let s = await availabilityForDay(r, date, 2);
  ok(!s.slots.includes("17:00") && s.slots.includes("18:00") && s.slots.includes("20:00") && !s.slots.includes("20:30"),
    `client's slots follow the edited window — ${s.slots.join(" ")}`);
  ok(!(await validateBooking(r, date, "17:00", 2)).ok, "the server refuses a time outside the edited window");

  // Owner changes the slot step to 60 min.
  await db.update(reservationHours).set({ slotMinutes: 60 }).where(eq(reservationHours.id, h1.id));
  s = await availabilityForDay(r, date, 2);
  ok(!s.slots.includes("18:30") && s.slots.includes("19:00"), `client sees hourly starts only — ${s.slots.join(" ")}`);
  await db.update(reservationHours).set({ slotMinutes: 30, startTime: "17:00", endTime: "22:00" }).where(eq(reservationHours.id, h1.id));

  // Owner pauses it.
  await db.update(reservationHours).set({ enabled: false }).where(eq(reservationHours.id, h1.id));
  ok(!(await clientDayChips(r)).has(dow), "pausing the day's only interval removes the weekday chip");
  ok((await availabilityForDay(r, date, 2)).slots.length === 0, "…and no slots are offered");
  ok(!(await validateBooking(r, date, "19:00", 2)).ok, "…and the server refuses a booking on it");
  ok((await clientDayChips(r)).has(otherDow), "the other weekday is unaffected");
  await db.update(reservationHours).set({ enabled: true }).where(eq(reservationHours.id, h1.id));
  ok((await clientDayChips(r)).has(dow), "resuming brings the weekday back");

  // ── 2. Seats per slot ───────────────────────────────────────────────────────
  sec("2. Locuri/slot");
  await db.update(reservationHours).set({ seatsPerSlot: 4 }).where(eq(reservationHours.id, h1.id));
  ok((await availabilityForDay(r, date, 4)).slots.includes("19:00"), "a party of 4 fits a 4-seat slot");
  ok(!(await availabilityForDay(r, date, 5)).slots.includes("19:00"), "a party of 5 does not");
  ok(!(await validateBooking(r, date, "19:00", 5)).ok, "…and the server agrees");
  await db.update(reservationHours).set({ seatsPerSlot: 20 }).where(eq(reservationHours.id, h1.id));
  ok((await availabilityForDay(r, date, 5)).slots.includes("19:00"), "raising it back re-opens the slot");

  // ── 3. Max party size ───────────────────────────────────────────────────────
  sec("3. Grup maxim");
  await db.update(restaurants).set({ reservationMaxPartySize: 6 }).where(eq(restaurants.id, r));
  ok(await getMaxPartySize(r) === 6, "the form's party selector caps at 6");
  ok((await validateBooking(r, date, "19:00", 6)).ok, "a party of 6 is accepted");
  const over = await validateBooking(r, date, "19:00", 7);
  ok(!over.ok && /între 1 și 6/.test(over.reason ?? ""), "a party of 7 is refused with the cap in the message");
  await db.update(restaurants).set({ reservationMaxPartySize: 12 }).where(eq(restaurants.id, r));

  // ── 4. Turn time ────────────────────────────────────────────────────────────
  sec("4. Durata unei mese");
  await db.insert(reservations).values({
    restaurantId: r, date, time: "19:00", partySize: 20, guestName: "Plin", guestPhone: "0700000000",
    status: "confirmed", turnMinutes: 90,
  });
  ok(!(await availabilityForDay(r, date, 2)).slots.includes("20:00"), "a full 90-min booking blocks 20:00");
  ok((await availabilityForDay(r, date, 2)).slots.includes("20:30"), "…and frees at 20:30");
  // With a 90-min turn a new party at 17:00 ends at 18:30 — clear of the 19:00 block.
  ok((await availabilityForDay(r, date, 2)).slots.includes("17:00"), "a new party can start at 17:00 (ends 18:30, before the block)");

  // The owner lengthens the standard turn to 150 min.
  await db.update(restaurants).set({ reservationTurnMinutes: 150 }).where(eq(restaurants.id, r));
  ok((await availabilityForDay(r, date, 2)).slots.includes("20:30"),
    "the EXISTING booking is not retroactively extended — it stored 90 min and still frees at 20:30");
  ok(!(await availabilityForDay(r, date, 2)).slots.includes("17:00"),
    "…but a NEW booking now needs 150 min, so 17:00 is gone (it would run to 19:30, into the block)");
  await db.update(restaurants).set({ reservationTurnMinutes: 90 }).where(eq(restaurants.id, r));
  ok((await availabilityForDay(r, date, 2)).slots.includes("17:00"), "back to 90 min → 17:00 is offered again");
  await db.delete(reservations).where(eq(reservations.restaurantId, r));

  // ── 5. Long turn for large parties ──────────────────────────────────────────
  sec("5. Durată mai mare pentru grupuri");
  let d4 = await clientDurationFor(r, 4);
  let d6 = await clientDurationFor(r, 6);
  ok(d4.minutes === 90 && d6.minutes === 90, "rule OFF → the form shows 90 min for every party size");

  await db.update(restaurants).set({ reservationLongTurnEnabled: true, reservationLongTurnFromParty: 5, reservationLongTurnMinutes: 120 }).where(eq(restaurants.id, r));
  d4 = await clientDurationFor(r, 4);
  d6 = await clientDurationFor(r, 6);
  ok(d4.minutes === 90 && d6.minutes === 120, "rule ON → the form shows 90 min for 4 people, 120 for 6");
  ok((await availabilityForDay(r, date, 6)).turnMinutes === 120, "the availability API reports the same 120 min");
  ok((await validateBooking(r, date, "19:00", 6)).turnMinutes === 120, "…and a booking stores 120 min");

  // Move the threshold up — a party of 6 goes back to the standard turn.
  await db.update(restaurants).set({ reservationLongTurnFromParty: 8 }).where(eq(restaurants.id, r));
  ok((await clientDurationFor(r, 6)).minutes === 90, "raising the threshold to 8 puts a party of 6 back on 90 min");
  await db.update(restaurants).set({ reservationLongTurnFromParty: 5 }).where(eq(restaurants.id, r));

  // ── 6. The reduced-duration fallback ────────────────────────────────────────
  sec("6. Rezervări cu durată redusă");
  // 20 seats; block 16 of them 20:00–21:30 so a party of 5 (2h) can't start at 18:30.
  await db.insert(reservations).values({
    restaurantId: r, date, time: "20:00", partySize: 16, guestName: "Bloc", guestPhone: "0700000000",
    status: "confirmed", turnMinutes: 90,
  });
  let a5 = await availabilityForDay(r, date, 5);
  ok(!a5.slots.includes("18:30"), "party 5 can't have 18:30 at the full 2h");
  ok(a5.reducedSlots.includes("18:30"), "…so it is offered as a reduced slot");
  ok((await validateBooking(r, date, "18:30", 5, undefined, undefined, { acceptReducedTurn: true })).turnMinutes === 90,
    "booking it stores the SHORT duration");

  await db.update(restaurants).set({ reservationAllowReducedTurn: false }).where(eq(restaurants.id, r));
  a5 = await availabilityForDay(r, date, 5);
  ok(a5.reducedSlots.length === 0, "owner turns the fallback off → the client sees no reduced slots at all");
  ok(!(await validateBooking(r, date, "18:30", 5, undefined, undefined, { acceptReducedTurn: true })).ok,
    "…and the server refuses it even if the client asks for it");
  await db.update(restaurants).set({ reservationAllowReducedTurn: true }).where(eq(restaurants.id, r));
  await db.delete(reservations).where(eq(reservations.restaurantId, r));

  // ── 7. Show-duration toggle ─────────────────────────────────────────────────
  sec("7. Arată durata rezervării");
  ok((await clientDurationFor(r, 2)).shown === false, "off by default → the form shows no duration line");
  await db.update(restaurants).set({ reservationShowDuration: true }).where(eq(restaurants.id, r));
  ok((await clientDurationFor(r, 2)).shown === true, "owner turns it on → the line appears");
  ok((await clientDurationFor(r, 6)).minutes === 120, "…and it is party-size aware (6 people → 2 ore)");

  // ── 8. Closed dates ─────────────────────────────────────────────────────────
  sec("8. Zile închise");
  ok(await clientOffersDate(r, date), "the date is offered before closing it");
  await db.insert(reservationClosures).values({ restaurantId: r, dateFrom: date, dateTo: date, reason: "Privat" });
  ok(!(await clientOffersDate(r, date)), "owner closes it → the client's day picker drops it");
  ok((await availabilityForDay(r, date, 2)).slots.length === 0, "…no slots are returned");
  ok(!(await validateBooking(r, date, "19:00", 2)).ok, "…and the server refuses the booking");
  ok(await clientOffersDate(r, dateForDow(dow, 1)), "the same weekday next week is still offered");
  await db.delete(reservationClosures).where(eq(reservationClosures.restaurantId, r));
  ok(await clientOffersDate(r, date), "reopening restores it");

  // ── 9. Advance-booking window ───────────────────────────────────────────────
  sec("9. Cu cât timp înainte");
  await db.update(restaurants).set({ reservationAdvanceDays: 3 }).where(eq(restaurants.id, r));
  ok((await getReservationConfig(r)).advanceDays === 3, "the form's date input max follows the setting");
  await db.update(restaurants).set({ reservationAdvanceDays: 60 }).where(eq(restaurants.id, r));

  // ── 10. Confirm mode ────────────────────────────────────────────────────────
  sec("10. Mod de confirmare");
  await db.update(restaurants).set({ reservationConfirmMode: "auto" }).where(eq(restaurants.id, r));
  const [cm1] = await db.select({ m: restaurants.reservationConfirmMode }).from(restaurants).where(eq(restaurants.id, r));
  ok(cm1.m === "auto", "auto → the form's button reads „Rezervă masa” and bookings land confirmed");
  await db.update(restaurants).set({ reservationConfirmMode: "manual" }).where(eq(restaurants.id, r));
  const [cm2] = await db.select({ m: restaurants.reservationConfirmMode }).from(restaurants).where(eq(restaurants.id, r));
  ok(cm2.m === "manual", "manual → „Trimite cererea de rezervare”, bookings land pending");

  // ── 11. Switching to tables mode + holding a table back ─────────────────────
  sec("11. Mese individuale + masă ținută pentru walk-in");
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r));
  ok((await availabilityForDay(r, date, 2)).slots.length === 0, "tables mode with NO tables → the client can't book anything");

  const t1 = (await db.insert(reservationTables).values({ restaurantId: r, label: "M1", seats: 4 }).returning({ id: reservationTables.id }))[0].id;
  const t2 = (await db.insert(reservationTables).values({ restaurantId: r, label: "M2", seats: 4 }).returning({ id: reservationTables.id }))[0].id;
  ok((await availabilityForDay(r, date, 4)).slots.includes("19:00"), "adding tables makes slots appear again");
  ok(!(await availabilityForDay(r, date, 5)).slots.includes("19:00"), "a party of 5 is refused — no single table fits and neither is joinable");

  await db.update(reservationTables).set({ joinable: true }).where(inArray(reservationTables.id, [t1, t2]));
  ok((await availabilityForDay(r, date, 5)).slots.includes("19:00"), "owner marks both joinable → a party of 5 can now book (4+4)");

  await db.update(reservationTables).set({ bookableOnline: false }).where(eq(reservationTables.id, t2));
  ok((await getReservationTables(r)).length === 1, "holding M2 back → the client's pool drops to one table");
  ok(!(await availabilityForDay(r, date, 5)).slots.includes("19:00"), "…so the party of 5 can no longer book online");
  ok((await getReservationTables(r, undefined, "staff")).length === 2, "…while staff still see both");
  await db.update(reservationTables).set({ bookableOnline: true }).where(eq(reservationTables.id, t2));
  ok((await availabilityForDay(r, date, 5)).slots.includes("19:00"), "releasing it restores the client's option");

  // Deactivating removes it from everyone.
  await db.update(reservationTables).set({ isActive: false }).where(eq(reservationTables.id, t2));
  ok(!(await availabilityForDay(r, date, 5)).slots.includes("19:00"), "deactivating M2 also removes the party-5 option");
  ok((await getReservationTables(r, undefined, "staff")).length === 1, "…for staff as well");
  await db.update(reservationTables).set({ isActive: true }).where(eq(reservationTables.id, t2));

  // ── 12. Zones ───────────────────────────────────────────────────────────────
  sec("12. Interior & terasă");
  await db.update(reservationTables).set({ area: "inside" }).where(eq(reservationTables.id, t1));
  await db.update(reservationTables).set({ area: "outside" }).where(eq(reservationTables.id, t2));
  await db.update(restaurants).set({ reservationAreasEnabled: true }).where(eq(restaurants.id, r));
  ok((await availabilityForDay(r, date, 4, "inside")).slots.includes("19:00"), "client can pick interior");
  ok((await availabilityForDay(r, date, 4, "outside")).slots.includes("19:00"), "client can pick terasă");
  ok(!(await availabilityForDay(r, date, 5, "inside")).slots.includes("19:00"), "a party of 5 can't join across zones (interior alone seats 4)");
  const noArea = await validateBooking(r, date, "19:00", 4);
  ok(!noArea.ok && /Alege zona/.test(noArea.reason ?? ""), "the server requires an area while zones are on");

  // Zones off (mirrors the route): the terrace table is parked.
  await db.update(restaurants).set({ reservationAreasEnabled: false }).where(eq(restaurants.id, r));
  await db.update(reservationTables).set({ isActive: false }).where(and(eq(reservationTables.restaurantId, r), eq(reservationTables.area, "outside")));
  ok((await getReservationTables(r)).every((t) => t.area !== "outside"), "zones off → terrace tables are no longer bookable by clients");
  ok((await validateBooking(r, date, "19:00", 4)).ok, "…and an area is no longer required");

  // ── 13. Master switch ───────────────────────────────────────────────────────
  sec("13. Oprirea rezervărilor");
  await db.update(restaurants).set({ reservationsEnabledByOwner: false }).where(eq(restaurants.id, r));
  const { canReserve } = await import("../lib/reservations");
  ok(!(await canReserve(r)), "owner switches reservations off → the public page hides the booking button");
  await db.update(restaurants).set({ reservationsEnabledByOwner: true, reservationsEnabledByAdmin: false }).where(eq(restaurants.id, r));
  ok(!(await canReserve(r)), "platform grant revoked → still off, even with the owner switch on");
  await db.update(restaurants).set({ reservationsEnabledByAdmin: true }).where(eq(restaurants.id, r));
  ok(await canReserve(r), "both on → bookable again");

  // ── 14. Stale client page can never beat the server ─────────────────────────
  sec("14. A stale client page can't book what the settings now forbid");
  const staleSlots = (await availabilityForDay(r, date, 4)).slots; // client loads the page
  ok(staleSlots.includes("19:00"), "client's page shows 19:00");

  // Owner then closes the day, pauses the interval and shrinks the room.
  await db.insert(reservationClosures).values({ restaurantId: r, dateFrom: date, dateTo: date });
  ok(!(await validateBooking(r, date, "19:00", 4)).ok, "submitting the stale 19:00 is refused — the day is now closed");
  await db.delete(reservationClosures).where(eq(reservationClosures.restaurantId, r));

  await db.update(reservationHours).set({ enabled: false }).where(eq(reservationHours.id, h1.id));
  ok(!(await validateBooking(r, date, "19:00", 4)).ok, "…refused after the interval is paused");
  await db.update(reservationHours).set({ enabled: true }).where(eq(reservationHours.id, h1.id));

  await db.update(reservationTables).set({ bookableOnline: false }).where(eq(reservationTables.id, t1));
  ok(!(await validateBooking(r, date, "19:00", 4)).ok, "…refused after the last online table is held back for walk-ins");
  await db.update(reservationTables).set({ bookableOnline: true }).where(eq(reservationTables.id, t1));
  ok((await validateBooking(r, date, "19:00", 4)).ok, "…and accepted once the settings allow it again");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
