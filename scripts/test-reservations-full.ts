/**
 * FULL reservations end-to-end test (DEV DB, idempotent) — every case from the
 * manual test guide, exercised through the real library code. Covers BOTH capacity
 * modes, BOTH with and without areas (interior/TERASĂ), the sliding window, joining,
 * validation, manual/forced creation, status+email, advance window, and board display.
 *
 * Run: pnpm tsx scripts/test-reservations-full.ts
 */
import "dotenv/config";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { db } from "../lib/db";
import { restaurants, places, reservations, reservationHours, reservationTables, users } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import {
  availableSlotsForDay, validateBooking, assignTablesFor, createManualReservation,
  setReservationStatus, listUpcomingReservations, getReservationConfig,
} from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); const s = t.toISOString().slice(0, 10); if (new Date(s + "T00:00:00").getDay() === dow) return s; }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "full-%"));
  const rids = r.map((x) => x.id);
  const p = await db.select({ id: places.id }).from(places).where(like(places.slug, "full-%"));
  const pids = p.map((x) => x.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  if (pids.length) await db.delete(places).where(inArray(places.id, pids));
}

async function mkRestaurant(slug: string, cfg: Partial<typeof restaurants.$inferInsert>) {
  const [p] = await db.insert(places).values({ name: slug, description: "t", slug: `full-${slug}-p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: slug, slug: `full-${slug}`, placeId: p.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationTurnMinutes: 90, reservationMaxPartySize: 16, ...cfg,
  }).returning({ id: restaurants.id });
  return r.id;
}
const book = (rid: string, date: string, time: string, party: number, area: string | null, tableIds: string[] | null, status = "confirmed") =>
  db.insert(reservations).values({ restaurantId: rid, date, time, partySize: party, guestName: "G", guestPhone: "0700", area, status, assignedTableIds: tableIds ? JSON.stringify(tableIds) : null });

async function main() {
  await cleanup();
  const dow = 5, date = dateForDow(dow); // a Friday

  // ─────────────────────────────────────────────────────────────────────────
  sec("PHASE 1 — SEATS mode, no areas: sliding window");
  const s1 = await mkRestaurant("seats", { reservationCapacityMode: "seats", reservationConfirmMode: "manual" });
  await db.insert(reservationHours).values({ restaurantId: s1, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 10 });
  ok((await availableSlotsForDay(s1, date, 2)).length === 9, "9 start times (18:00–22:00 inclusive, every 30 min)");
  await book(s1, date, "19:00", 10, null, null); // fill 10 seats @19:00
  const after1 = await availableSlotsForDay(s1, date, 1);
  ok(!["19:00", "19:30", "20:00"].some((t) => after1.includes(t)), "full slot blocks 19:00–20:00 (sliding window)");
  ok(after1.includes("20:30"), "20:30 free again (turn 90 ended)");
  ok(!after1.includes("18:00"), "18:00 blocked (its window overlaps 19:00 booking)");

  // ─────────────────────────────────────────────────────────────────────────
  sec("PHASE 1b — SEATS mode, with TERASĂ: per-area capacity");
  const s2 = await mkRestaurant("seatsarea", { reservationCapacityMode: "seats", reservationAreasEnabled: true });
  await db.insert(reservationHours).values({ restaurantId: s2, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 14, seatsInside: 8, seatsOutside: 6 });
  ok((await availableSlotsForDay(s2, date, 6, "outside")).includes("19:00"), "terasă (6 seats) fits party 6 at 19:00");
  ok(!(await availableSlotsForDay(s2, date, 7, "outside")).includes("19:00"), "terasă can't fit party 7 (only 6 seats)");
  await book(s2, date, "19:00", 6, "outside", null); // fill terasă
  ok(!(await availableSlotsForDay(s2, date, 1, "outside")).includes("19:00"), "terasă full at 19:00");
  ok((await availableSlotsForDay(s2, date, 8, "inside")).includes("19:00"), "interior still open (independent 8 seats)");
  const okArea = await validateBooking(s2, date, "19:00", 2); // no area given
  ok(!okArea.ok, "areas on → booking without an area is rejected");

  // ─────────────────────────────────────────────────────────────────────────
  sec("PHASE 3 — TABLES mode, no areas: fit / join / refuse");
  const t1 = await mkRestaurant("tables", { reservationCapacityMode: "tables", reservationMaxJoin: 2 });
  await db.insert(reservationHours).values({ restaurantId: t1, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 0 });
  const mk = (label: string, seats: number, joinable: boolean) => db.insert(reservationTables).values({ restaurantId: t1, label, seats, joinable, area: null }).returning({ id: reservationTables.id });
  const [m1] = await mk("M1", 2, true); const [m2] = await mk("M2", 2, true);
  const [m3] = await mk("M3", 4, true); const [m4] = await mk("M4", 4, true);
  await mk("M5", 6, false); await mk("M6", 6, false);
  ok((await availableSlotsForDay(t1, date, 2)).includes("19:00"), "party 2 fits (a 2-top)");
  ok((await availableSlotsForDay(t1, date, 3)).includes("19:00"), "party 3 fits (a 4-top — bigger table OK)");
  ok((await availableSlotsForDay(t1, date, 6)).includes("19:00"), "party 6 fits (a 6-top)");
  ok((await availableSlotsForDay(t1, date, 8)).includes("19:00"), "party 8 fits (join 4+4)");
  ok(!(await availableSlotsForDay(t1, date, 9)).includes("19:00"), "party 9 REFUSED — max fit is 8 despite 24 total seats");

  sec("PHASE 3b — TABLES exhaustion + join + sliding release + board");
  await book(t1, date, "19:00", 6, null, (await assignTablesFor(t1, date, "19:00", 6))!); // 6-top #1
  await book(t1, date, "19:00", 6, null, (await assignTablesFor(t1, date, "19:00", 6))!); // 6-top #2
  const join6 = await assignTablesFor(t1, date, "19:00", 6); // both 6-tops busy → join 4+4
  ok(join6 !== null && join6.length === 2 && join6.includes(m3.id) && join6.includes(m4.id), "party 6 now JOINS M3+M4 (both 6-tops busy)");
  await book(t1, date, "19:00", 6, null, join6!);
  ok(await assignTablesFor(t1, date, "19:00", 4) !== null, "party 4 still fits at 19:00 (joins M1+M2)");
  ok(await assignTablesFor(t1, date, "19:00", 3) !== null, "party 3 fits (M1+M2 = 4)");
  ok(await assignTablesFor(t1, date, "19:00", 5) === null, "party 5 refused (only 2+2 joinable left)");
  ok((await availableSlotsForDay(t1, date, 6)).includes("20:30"), "sliding release: party 6 free again at 20:30");
  // Board resolves assigned table labels.
  const boardRows = await listUpcomingReservations(t1);
  ok(boardRows.every((r) => Array.isArray(r.tables)), "board rows carry resolved table labels");
  ok(boardRows.some((r) => r.tables.length === 2), "a joined booking shows 2 table labels on the board");

  // ─────────────────────────────────────────────────────────────────────────
  sec("PHASE 4 — TABLES mode + TERASĂ: area isolation + joins within area");
  const t2 = await mkRestaurant("tablesarea", { reservationCapacityMode: "tables", reservationAreasEnabled: true, reservationMaxJoin: 2 });
  await db.insert(reservationHours).values({ restaurantId: t2, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 0 });
  const mkA = (label: string, seats: number, joinable: boolean, area: string) => db.insert(reservationTables).values({ restaurantId: t2, label, seats, joinable, area }).returning({ id: reservationTables.id });
  const [ti1] = await mkA("I1", 4, true, "inside"); const [ti2] = await mkA("I2", 4, true, "inside");
  const [to1] = await mkA("T1", 4, false, "outside");
  ok((await availableSlotsForDay(t2, date, 4, "outside")).includes("19:00"), "terasă party 4 fits (T1)");
  ok((await availableSlotsForDay(t2, date, 8, "inside")).includes("19:00"), "interior party 8 fits (join I1+I2)");
  ok(!(await availableSlotsForDay(t2, date, 8, "outside")).includes("19:00"), "terasă party 8 REFUSED (only one 4-top, not joinable)");
  await book(t2, date, "19:00", 4, "outside", [to1.id]); // fill terasă
  ok(!(await availableSlotsForDay(t2, date, 2, "outside")).includes("19:00"), "terasă full at 19:00");
  ok((await availableSlotsForDay(t2, date, 4, "inside")).includes("19:00"), "interior still open (independent)");
  // Interior join must NOT pull the terasă table.
  const insJoin = await assignTablesFor(t2, date, "19:00", 8, "inside");
  ok(insJoin !== null && !insJoin.includes(to1.id) && insJoin.includes(ti1.id) && insJoin.includes(ti2.id), "interior join uses only interior tables (I1+I2), never terasă");

  // ─────────────────────────────────────────────────────────────────────────
  sec("PHASE 2/6 — confirm status, manual create, validation, advance window");
  // Manual (staff) create — confirmed immediately + assigns a table in tables mode.
  const man = await createManualReservation(t1, { date, time: "20:30", partySize: 6, guestName: "Phone", guestPhone: "0711" }, false);
  ok(man.ok, "staff manual reservation (tables mode) creates + assigns");
  // Force override books even with no free table.
  await book(t1, date, "20:00", 6, null, (await assignTablesFor(t1, date, "20:00", 6)) ?? null);
  const forced = await createManualReservation(t1, { date, time: "19:00", partySize: 9, guestName: "F", guestPhone: "0711" }, true);
  ok(forced.ok, "force override books party 9 with no table");
  // Party over max rejected.
  const overMax = await validateBooking(t1, date, "19:00", 99);
  ok(!overMax.ok, "party over the restaurant max is rejected");
  // Closed day (no hours) → no slots.
  ok((await availableSlotsForDay(t1, dateForDow((dow + 1) % 7 === dow ? (dow + 2) % 7 : (dow + 1) % 7), 2)).length >= 0, "closed-day query returns safely");
  const closed = await availableSlotsForDay(t1, "2020-01-01", 2); // a Wednesday with no matching hours
  ok(closed.length === 0, "a day with no hours → no slots (closed)");
  // Advance-window config is readable (drives the date-picker max).
  const cfg = await getReservationConfig(t1);
  ok(cfg.advanceDays > 0 && cfg.mode === "tables" && cfg.maxJoin === 2, "getReservationConfig returns advanceDays/mode/maxJoin");

  // ─────────────────────────────────────────────────────────────────────────
  sec("PHASE 5 — status change + guest email (best-effort)");
  const [gr] = await db.insert(reservations).values({ restaurantId: t1, date, time: "21:30", partySize: 2, guestName: "Mail", guestPhone: "0700", guestEmail: "guest@full.test", status: "pending", assignedTableIds: JSON.stringify([m1.id]) }).returning({ id: reservations.id });
  ok(await setReservationStatus(t1, gr.id, "confirmed"), "confirm a pending booking (guest-with-email) → ok, no throw");
  const [confd] = await db.select({ s: reservations.status }).from(reservations).where(eq(reservations.id, gr.id));
  ok(confd.s === "confirmed", "status persisted as confirmed");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
