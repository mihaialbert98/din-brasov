/**
 * SAFETY AUDIT for switching capacity modes in both directions. Overbooking a
 * restaurant is the worst failure this feature could cause, so this checks every case:
 *   - backfill respects AREA (an outside booking never gets an inside table)
 *   - backfill respects the TURN WINDOW (overlapping bookings never share a table)
 *   - PAST bookings and CANCELLED/DECLINED bookings are never touched
 *   - a table freed after the turn ends IS reused (no wasted capacity)
 *   - THE INVARIANT: across every pair of overlapping live bookings, the assigned
 *     table sets are disjoint (i.e. no double-booking) — checked exhaustively
 *   - reverse switch (tables → seats): party sizes still consume the pool, per AREA
 *   - no tables at all → no crash, everything reported
 * Throwaway restaurant (slug mswaud-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-mode-switch-audit.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, backfillTableAssignments } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "mswaud-";
const TURN = 90;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(iso(t) + "T00:00:00").getDay() === dow) return iso(t); }
  return "";
}
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const parse = (j: string | null): string[] => { try { return j ? JSON.parse(j) : []; } catch { return []; } };

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

/** THE anti-overbooking invariant: overlapping live bookings must not share a table. */
async function assertNoDoubleBooking(restaurantId: string, label: string) {
  const rows = await db
    .select({ id: reservations.id, date: reservations.date, time: reservations.time, status: reservations.status, a: reservations.assignedTableIds, name: reservations.guestName })
    .from(reservations)
    .where(eq(reservations.restaurantId, restaurantId));
  const live = rows.filter((r) => r.status === "pending" || r.status === "confirmed");
  const clashes: string[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j];
      if (A.date !== B.date) continue;
      const as = mins(A.time), bs = mins(B.time);
      const overlap = as < bs + TURN && bs < as + TURN;
      if (!overlap) continue;
      const shared = parse(A.a).filter((t) => parse(B.a).includes(t));
      if (shared.length) clashes.push(`${A.name} ↔ ${B.name} share ${shared.length} table(s)`);
    }
  }
  ok(clashes.length === 0, `${label}: no overlapping bookings share a table${clashes.length ? " — " + clashes.join("; ") : ""}`);
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);
  const past = iso(new Date(Date.now() - 3 * 86400000));

  const [pl] = await db.insert(places).values({ name: "MswAud", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "MswAud", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationAreasEnabled: true,
    reservationTurnMinutes: TURN, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 16, seatsInside: 10, seatsOutside: 6 });

  const base = { restaurantId: r.id, guestPhone: "0700000000" };

  sec("0. No tables yet → backfill reports everything, no crash");
  await db.insert(reservations).values({ ...base, date, time: "19:00", partySize: 4, guestName: "Early", area: "inside", status: "confirmed" });
  const empty = await backfillTableAssignments(r.id);
  ok(empty.assigned === 0 && empty.unassigned.length === 1, `no tables → 0 assigned, 1 reported — got ${empty.assigned}/${empty.unassigned.length}`);
  await db.delete(reservations).where(eq(reservations.restaurantId, r.id));

  // The room: inside I1(2) I2(4) I3(4), outside O1(2) O2(4). All joinable.
  const T: Record<string, string> = {};
  for (const [label, seats, area] of [["I1", 2, "inside"], ["I2", 4, "inside"], ["I3", 4, "inside"], ["O1", 2, "outside"], ["O2", 4, "outside"]] as const) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r.id, label, seats, joinable: true, area }).returning({ id: reservationTables.id });
    T[label] = t.id;
  }
  const labelOf = (id: string) => Object.keys(T).find((k) => T[k] === id) ?? "?";

  // Seats-mode bookings (no table held) covering every tricky case.
  const mk = async (time: string, partySize: number, area: "inside" | "outside", name: string, status: "confirmed" | "pending" | "cancelled" | "declined" = "confirmed", d = date) => {
    const [x] = await db.insert(reservations).values({ ...base, date: d, time, partySize, guestName: name, area, status }).returning({ id: reservations.id });
    return x.id;
  };
  const b1 = await mk("19:00", 4, "inside", "B1 inside 19:00");
  const b2 = await mk("19:30", 4, "inside", "B2 inside 19:30");   // overlaps B1
  const b3 = await mk("19:00", 2, "outside", "B3 outside 19:00");
  const b4 = await mk("19:00", 4, "inside", "B4 PAST", "confirmed", past);
  const b5 = await mk("19:00", 4, "inside", "B5 cancelled", "cancelled");
  const b6 = await mk("21:30", 4, "inside", "B6 late (after turn)"); // B1 ends 20:30 → free
  const b7 = await mk("20:00", 2, "outside", "B7 pending outside", "pending"); // overlaps B3

  sec("1. Backfill assigns only the right bookings");
  const rep = await backfillTableAssignments(r.id);
  console.log(`     (assigned=${rep.assigned}, unassigned=${rep.unassigned.map((u) => u.guestName).join(", ") || "none"})`);
  const get = async (id: string) => parse((await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.id, id)))[0].a);
  const A1 = await get(b1), A2 = await get(b2), A3 = await get(b3), A4 = await get(b4), A5 = await get(b5), A6 = await get(b6), A7 = await get(b7);

  ok(A4.length === 0, "PAST booking is never touched");
  ok(A5.length === 0, "CANCELLED booking is never given a table");
  ok(A1.length > 0 && A2.length > 0 && A3.length > 0 && A6.length > 0, "future live bookings all got tables");
  ok(A7.length > 0, "PENDING bookings are seated too (they hold capacity)");

  sec("2. Area is respected");
  ok(A1.every((id) => ["I1", "I2", "I3"].includes(labelOf(id))), `inside booking got inside tables — ${A1.map(labelOf).join("+")}`);
  ok(A3.every((id) => ["O1", "O2"].includes(labelOf(id))), `outside booking got outside tables — ${A3.map(labelOf).join("+")}`);
  ok(A7.every((id) => ["O1", "O2"].includes(labelOf(id))), `outside pending got outside tables — ${A7.map(labelOf).join("+")}`);

  sec("3. Turn window respected (overlap = different tables, no overlap = reuse)");
  ok(A1.every((id) => !A2.includes(id)), `B1 (19:00) and B2 (19:30) overlap → different tables (${A1.map(labelOf)} vs ${A2.map(labelOf)})`);
  ok(A3.every((id) => !A7.includes(id)), `B3 (19:00) and B7 (20:00) overlap → different tables (${A3.map(labelOf)} vs ${A7.map(labelOf)})`);
  ok(A6.some((id) => A1.includes(id) || A2.includes(id)), `B6 (21:30, after the turn) REUSES a freed table — ${A6.map(labelOf).join("+")}`);

  sec("4. THE INVARIANT — no double-booking anywhere");
  await assertNoDoubleBooking(r.id, "after seats→tables backfill");

  sec("4b. Every seated booking actually has ENOUGH seats");
  const seatMap = new Map<string, number>([["I1", 2], ["I2", 4], ["I3", 4], ["O1", 2], ["O2", 4]]);
  const seatsOf = (ids: string[]) => ids.reduce((s, id) => s + (seatMap.get(labelOf(id)) ?? 0), 0);
  ok(seatsOf(A1) >= 4 && seatsOf(A2) >= 4 && seatsOf(A6) >= 4, `4-person parties got ≥4 seats (${seatsOf(A1)}, ${seatsOf(A2)}, ${seatsOf(A6)})`);
  ok(seatsOf(A3) >= 2 && seatsOf(A7) >= 2, `2-person parties got ≥2 seats (${seatsOf(A3)}, ${seatsOf(A7)})`);

  sec("5. Availability is honest after the switch (no oversell)");
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r.id));
  // Inside at 19:00: I2 + I3 held by B1 and B2; only I1 (2 seats) is left.
  ok(!(await availableSlotsForDay(r.id, date, 4, "inside")).includes("19:00"), "inside 19:00 refused for a party of 4 — only the 2-seat table is free");
  ok((await availableSlotsForDay(r.id, date, 2, "inside")).includes("19:00"), "…but a party of 2 still fits on that free 2-seat table");
  // Outside at 19:00: O1+O2 held by B3 and B7 → nothing left for a party of 2.
  ok(!(await availableSlotsForDay(r.id, date, 2, "outside")).includes("19:00"), "outside 19:00 refused — both terrace tables are genuinely taken");
  ok((await availableSlotsForDay(r.id, date, 2, "outside")).includes("21:30"), "outside opens again later (after the turn)");

  sec("6. Reverse switch (tables → seats): party sizes consume the pool, per area");
  await db.update(restaurants).set({ reservationCapacityMode: "seats" }).where(eq(restaurants.id, r.id));
  // Inside pool = 10; B1(4) + B2(4) = 8 held at 19:30.
  ok((await availableSlotsForDay(r.id, date, 2, "inside")).includes("19:30"), "inside party 2 fits (8 + 2 = 10)");
  ok(!(await availableSlotsForDay(r.id, date, 3, "inside")).includes("19:30"), "inside party 3 refused (8 + 3 > 10) — no oversell");
  // Outside pool = 6; B3(2) + B7(2) = 4 at 20:00.
  ok((await availableSlotsForDay(r.id, date, 2, "outside")).includes("20:00"), "outside party 2 fits (4 + 2 = 6)");
  ok(!(await availableSlotsForDay(r.id, date, 3, "outside")).includes("20:00"), "outside party 3 refused (4 + 3 > 6) — no oversell");
  ok((await get(b1)).length > 0, "table assignments are preserved while in seats mode");

  sec("7. Round-trip back to tables mode stays correct");
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r.id));
  const again = await backfillTableAssignments(r.id);
  ok(again.assigned === 0, `re-running backfill assigns nothing new (idempotent) — got ${again.assigned}`);
  await assertNoDoubleBooking(r.id, "after the round trip");
  ok(!(await availableSlotsForDay(r.id, date, 2, "outside")).includes("19:00"), "occupancy still honest after the round trip");

  sec("8. Randomized stress — 60 mixed bookings, then verify the invariants");
  await db.delete(reservations).where(eq(reservations.restaurantId, r.id));
  await db.update(restaurants).set({ reservationCapacityMode: "seats" }).where(eq(restaurants.id, r.id));
  const slots = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
  const statuses = ["confirmed", "confirmed", "confirmed", "pending", "cancelled", "declined"] as const;
  const rnd = (n: number) => Math.floor(Math.random() * n);
  const bulk = Array.from({ length: 60 }, (_, i) => ({
    ...base,
    date,
    time: slots[rnd(slots.length)],
    partySize: 1 + rnd(4),
    area: (rnd(2) ? "inside" : "outside") as "inside" | "outside",
    guestName: `S${i}`,
    status: statuses[rnd(statuses.length)],
  }));
  await db.insert(reservations).values(bulk);

  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r.id));
  const stress = await backfillTableAssignments(r.id);
  console.log(`     (assigned=${stress.assigned}, could not fit=${stress.unassigned.length})`);
  await assertNoDoubleBooking(r.id, "stress: 60 random bookings");

  // Every seated booking must hold enough seats, in its own area.
  const seated = await db
    .select({ a: reservations.assignedTableIds, partySize: reservations.partySize, area: reservations.area, status: reservations.status, name: reservations.guestName })
    .from(reservations).where(eq(reservations.restaurantId, r.id));
  const live = seated.filter((x) => (x.status === "pending" || x.status === "confirmed") && parse(x.a).length);
  const badSeats = live.filter((x) => seatsOf(parse(x.a)) < x.partySize);
  const badArea = live.filter((x) => parse(x.a).some((id) => (["I1", "I2", "I3"].includes(labelOf(id)) ? "inside" : "outside") !== x.area));
  const deadStatus = seated.filter((x) => (x.status === "cancelled" || x.status === "declined") && parse(x.a).length);
  ok(badSeats.length === 0, `every seated booking has enough seats (${live.length} checked)`);
  ok(badArea.length === 0, "every seated booking stayed in its own area");
  ok(deadStatus.length === 0, "no cancelled/declined booking ever received a table");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
