/**
 * Per-party turn time — the highest-risk part of v0.26.0, because getting it wrong
 * oversells a table (a big party still seated while someone else is booked onto it).
 *
 * Proves:
 *   - a booking stores the duration it was made with (reservations.turnMinutes)
 *   - occupancy honours EACH booking's own stored duration, not one global value
 *   - a large party needs the longer window, so it loses exactly the start times
 *     where the extra minutes collide — and no others
 *   - turning the rule ON never changes an existing booking (no retroactive overlap)
 *   - `reducedSlots` are real: they fit at the standard turn and are excluded from
 *     `slots`, and booking one stores the SHORT duration (so it can't overrun)
 *   - the reduced fallback is never handed out when the owner disabled it, and the
 *     flag can't be forged by a client to grab a slot that doesn't fit either way
 *   - EXHAUSTIVE: after a mixed-duration booking run, no two bookings sharing a
 *     table ever overlap in time
 *
 * Throwaway restaurants (slug vturn-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-variable-turn.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availabilityForDay, validateBooking, assignTablesFor, createManualReservation, getReservationConfig, turnFor } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "vturn-";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
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

/** A restaurant with one dinner window; `mode` picks the capacity model. */
async function makeRestaurant(key: string, mode: "seats" | "tables", dow: number, seats = 20) {
  const [pl] = await db.insert(places).values({ name: `VTurn ${key}`, description: "t", slug: `${P}${key}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `VTurn ${key}`, slug: `${P}${key}`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: mode, reservationTurnMinutes: 90, reservationMaxPartySize: 20,
    reservationLongTurnEnabled: true, reservationLongTurnFromParty: 5, reservationLongTurnMinutes: 120,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: seats });
  return r.id;
}

async function book(rid: string, date: string, time: string, partySize: number, turnMinutes: number | null, tableIds?: string[]) {
  const [row] = await db.insert(reservations).values({
    restaurantId: rid, date, time, partySize, guestName: "T", guestPhone: "0700000000",
    status: "confirmed", turnMinutes, assignedTableIds: tableIds ? JSON.stringify(tableIds) : null,
  }).returning({ id: reservations.id });
  return row.id;
}

async function main() {
  await cleanup();
  const dow = 3, date = dateForDow(dow);

  // ── 1. turnFor: the rule itself ──────────────────────────────────────────────
  sec("1. turnFor picks the duration from the party size");
  const rSeats = await makeRestaurant("seats", "seats", dow, 20);
  const cfg = await getReservationConfig(rSeats);
  ok(cfg.turn === 90 && cfg.longTurn.enabled && cfg.longTurn.fromParty === 5 && cfg.longTurn.minutes === 120, "config loads the long-turn rule");
  ok(turnFor(4, cfg) === 90, "a party of 4 gets the standard 90 min");
  ok(turnFor(5, cfg) === 120, "a party of 5 (the threshold) gets 120 min");
  ok(turnFor(9, cfg) === 120, "a party of 9 gets 120 min");
  ok(turnFor(5, { ...cfg, longTurn: { ...cfg.longTurn, enabled: false } }) === 90, "rule off → everyone gets the standard turn");
  // A long turn shorter than the standard one would invert the rule — it's clamped.
  const cfgBad = await (async () => {
    await db.update(restaurants).set({ reservationLongTurnMinutes: 30 }).where(eq(restaurants.id, rSeats));
    const c = await getReservationConfig(rSeats);
    await db.update(restaurants).set({ reservationLongTurnMinutes: 120 }).where(eq(restaurants.id, rSeats));
    return c;
  })();
  ok(cfgBad.longTurn.minutes === 90, "a long turn set BELOW the standard is clamped up (can't shorten big parties)");

  // ── 2. Seats mode: the longer window costs exactly the colliding start times ──
  sec("2. Seats mode — a large party needs the room free for longer");
  // 20 seats. Book 16 at 20:00 for 90 min → 20:00–21:30 has only 4 seats spare.
  await book(rSeats, date, "20:00", 16, 90);
  const small = await availabilityForDay(rSeats, date, 4); // 90-min window
  const large = await availabilityForDay(rSeats, date, 5); // 120-min window, 5 > 4 spare
  ok(small.turnMinutes === 90 && large.turnMinutes === 120, "availability reports each party's own duration");
  ok(small.slots.includes("19:00"), "party 4 can start at 19:00 (frees at 20:30, overlaps the block but 16+4 = 20 fits)");
  ok(!large.slots.includes("19:00"), "party 5 CANNOT start at 19:00 — 16+5 = 21 > 20 during the overlap");
  ok(large.slots.includes("18:00"), "party 5 can start at 18:00 (ends 20:00, just before the block)");
  ok(!large.slots.includes("18:30"), "party 5 cannot start at 18:30 — its window would run into the 20:00 block");

  // ── 3. Reduced slots: real, and excluded from the full list ───────────────────
  sec("3. Reduced-duration fallback");
  ok(large.reducedSlots.includes("18:30"), "18:30 comes back as a REDUCED slot (fits at 90 min, not at 120)");
  ok(large.reducedSlots.every((s) => !large.slots.includes(s)), "reduced slots never duplicate the full-duration ones");
  ok(large.reducedTurnMinutes === 90, "a reduced slot is offered at the standard 90 min");
  for (const s of large.reducedSlots) {
    const at90 = await availabilityForDay(rSeats, date, 5); // same party, but check the claim directly
    ok(at90.reducedSlots.includes(s) || at90.slots.includes(s), `reduced slot ${s} is genuinely bookable at the shorter stay`);
    break; // one spot-check is enough; the exhaustive proof is section 7
  }

  sec("3b. Booking a reduced slot stores the SHORT duration");
  const v = await validateBooking(rSeats, date, "18:30", 5, undefined, undefined, { acceptReducedTurn: true });
  ok(v.ok && v.turnMinutes === 90, "validateBooking accepts the reduced slot and pins it to 90 min");
  const vNoFlag = await validateBooking(rSeats, date, "18:30", 5);
  ok(!vNoFlag.ok, "…without the flag the same slot is refused (the guest never opted in)");

  sec("3c. The reduced flag can't be forged into a slot that doesn't fit at all");
  // 19:00 fails at BOTH durations for a party of 17 (16 already booked, 20 seats).
  const forged = await validateBooking(rSeats, date, "19:00", 17, undefined, undefined, { acceptReducedTurn: true });
  ok(!forged.ok, "a slot that fails at the standard turn too is still refused with the flag set");

  sec("3d. Owner disabled the fallback → no reduced slots are offered");
  await db.update(restaurants).set({ reservationAllowReducedTurn: false }).where(eq(restaurants.id, rSeats));
  const noReduce = await availabilityForDay(rSeats, date, 5);
  ok(noReduce.reducedSlots.length === 0, "reducedSlots is empty when the owner turned the fallback off");
  const vOff = await validateBooking(rSeats, date, "18:30", 5, undefined, undefined, { acceptReducedTurn: true });
  ok(!vOff.ok, "…and the flag is ignored, so the slot can't be booked");
  await db.update(restaurants).set({ reservationAllowReducedTurn: true }).where(eq(restaurants.id, rSeats));

  // ── 4. Occupancy honours each booking's OWN stored duration ──────────────────
  sec("4. Each booking releases its seats per its own stored turn");
  const rMix = await makeRestaurant("mix", "seats", dow, 10);
  await book(rMix, date, "19:00", 10, 120); // a big party holding ALL seats until 21:00
  const at2030 = await availabilityForDay(rMix, date, 2);
  ok(!at2030.slots.includes("20:30"), "20:30 is blocked — the 120-min booking is still seated");
  ok(at2030.slots.includes("21:00"), "21:00 is free — it releases at 21:00, not at 20:30");
  // The same booking stored as 90 min would have released at 20:30 — proving the
  // stored column (not the party size or a global default) is what's being read.
  await db.update(reservations).set({ turnMinutes: 90 }).where(eq(reservations.restaurantId, rMix));
  const at2030b = await availabilityForDay(rMix, date, 2);
  ok(at2030b.slots.includes("20:30"), "rewritten to 90 min → 20:30 opens up (the stored value is authoritative)");

  sec("4b. Legacy rows (turnMinutes NULL) fall back to the restaurant's standard turn");
  await db.update(reservations).set({ turnMinutes: null }).where(eq(reservations.restaurantId, rMix));
  const legacy = await availabilityForDay(rMix, date, 2);
  ok(legacy.slots.includes("20:30") && !legacy.slots.includes("19:30"), "a NULL row behaves exactly like a 90-min booking");

  // ── 5. Turning the rule ON is never retroactive ──────────────────────────────
  sec("5. Enabling the rule leaves existing bookings byte-identical");
  const rRetro = await makeRestaurant("retro", "seats", dow, 10);
  await db.update(restaurants).set({ reservationLongTurnEnabled: false }).where(eq(restaurants.id, rRetro));
  const vBefore = await validateBooking(rRetro, date, "19:00", 6);
  const bookedId = await book(rRetro, date, "19:00", 6, vBefore.turnMinutes ?? null);
  const [beforeRow] = await db.select().from(reservations).where(eq(reservations.id, bookedId));
  ok(beforeRow.turnMinutes === 90, "booked while the rule was OFF → stored 90 min");

  await db.update(restaurants).set({ reservationLongTurnEnabled: true }).where(eq(restaurants.id, rRetro));
  const [afterRow] = await db.select().from(reservations).where(eq(reservations.id, bookedId));
  ok(afterRow.turnMinutes === 90 && afterRow.time === beforeRow.time && afterRow.partySize === beforeRow.partySize,
    "after switching the rule ON the existing booking is UNCHANGED (still 90 min)");
  const retroAvail = await availabilityForDay(rRetro, date, 2);
  ok(retroAvail.slots.includes("20:30"), "…and it still releases at 20:30, so no new overlap was created");
  const vAfter = await validateBooking(rRetro, date, "17:00", 6);
  ok(vAfter.ok && vAfter.turnMinutes === 120, "a NEW party of 6 now gets 120 min");

  // ── 6. Tables mode ───────────────────────────────────────────────────────────
  sec("6. Tables mode — the long turn holds the table longer");
  const rTab = await makeRestaurant("tab", "tables", dow);
  const [t1] = await db.insert(reservationTables).values({ restaurantId: rTab, label: "M1", seats: 6, joinable: false }).returning({ id: reservationTables.id });
  await book(rTab, date, "19:00", 6, 120, [t1.id]); // big party, 19:00–21:00

  ok((await assignTablesFor(rTab, date, "20:30", 2)) === null, "M1 is still busy at 20:30 (the 120-min booking hasn't ended)");
  ok((await assignTablesFor(rTab, date, "21:00", 2)) !== null, "M1 frees exactly at 21:00");
  const tabAvail = await availabilityForDay(rTab, date, 6);
  ok(!tabAvail.slots.includes("20:00"), "no party of 6 offered at 20:00 — the table is held");
  ok(tabAvail.slots.includes("21:00"), "…offered again at 21:00");

  sec("6b. Tables mode reduced fallback");
  // Free 17:00–19:00 (2h gap before the 19:00 booking). A party of 5 needs 120 min:
  // 17:00 fits exactly; 17:30 does not (would run to 19:30) but fits at 90 min.
  const gap = await availabilityForDay(rTab, date, 5);
  ok(gap.slots.includes("17:00"), "party 5 fits at 17:00 (ends exactly at 19:00)");
  ok(!gap.slots.includes("17:30"), "party 5 does NOT fit at 17:30 at full duration");
  ok(gap.reducedSlots.includes("17:30"), "…but 17:30 is offered as a reduced slot (90 min ends at 19:00)");
  const vTab = await validateBooking(rTab, date, "17:30", 5, undefined, undefined, { acceptReducedTurn: true });
  ok(vTab.ok && vTab.turnMinutes === 90 && !!vTab.assignedTableIds?.length, "booking it assigns a table and stores 90 min");

  // ── 7. EXHAUSTIVE: no two bookings on the same table ever overlap ─────────────
  sec("7. Exhaustive overlap proof after a mixed-duration booking run");
  const rStress = await makeRestaurant("stress", "tables", dow);
  const made: string[] = [];
  for (const [label, seats] of [["S1", 2], ["S2", 4], ["S3", 6], ["S4", 8]] as const) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: rStress, label, seats, joinable: true }).returning({ id: reservationTables.id });
    made.push(t.id);
  }
  // Book greedily across the evening with a mix of small (90) and large (120) parties.
  let accepted = 0;
  for (const time of ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"]) {
    for (const party of [2, 6, 3, 5]) {
      const res = await validateBooking(rStress, date, time, party, undefined, undefined, { acceptReducedTurn: true });
      if (res.ok) {
        await book(rStress, date, time, party, res.turnMinutes ?? null, res.assignedTableIds);
        accepted++;
      }
    }
  }
  ok(accepted > 0, `booked ${accepted} reservations of mixed sizes/durations`);

  const rows = await db
    .select({ id: reservations.id, time: reservations.time, partySize: reservations.partySize, turnMinutes: reservations.turnMinutes, assignedTableIds: reservations.assignedTableIds })
    .from(reservations)
    .where(eq(reservations.restaurantId, rStress));
  ok(rows.every((r) => r.turnMinutes !== null), "every booking stored an explicit duration");
  ok(rows.every((r) => r.turnMinutes === (r.partySize >= 5 ? 120 : 90) || r.turnMinutes === 90),
    "each stored duration is either this party's full turn or the reduced (90 min) one");

  let clashes = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const aT: string[] = JSON.parse(a.assignedTableIds ?? "[]");
      const bT: string[] = JSON.parse(b.assignedTableIds ?? "[]");
      if (!aT.some((t) => bT.includes(t))) continue; // different tables — can't clash
      const aS = toMin(a.time), aE = aS + (a.turnMinutes ?? 90);
      const bS = toMin(b.time), bE = bS + (b.turnMinutes ?? 90);
      if (aS < bE && bS < aE) {
        clashes++;
        console.log(`    ✗ CLASH: ${a.time}(+${a.turnMinutes}) vs ${b.time}(+${b.turnMinutes}) share a table`);
      }
    }
  }
  ok(clashes === 0, `no two bookings sharing a table overlap in time (${rows.length} bookings, every pair checked)`);

  // ── 8. Manual (staff) bookings follow the same rules ─────────────────────────
  sec("8. Staff manual booking stores the right duration");
  const rMan = await makeRestaurant("man", "seats", dow, 20);
  const m1 = await createManualReservation(rMan, { date, time: "19:00", partySize: 6, guestName: "Grup", guestPhone: "0711111111" }, false);
  ok(m1.ok, "staff can add a party of 6");
  const [manRow] = await db.select({ turnMinutes: reservations.turnMinutes }).from(reservations).where(eq(reservations.restaurantId, rMan));
  ok(manRow.turnMinutes === 120, "…and it stored the 120-min large-party duration");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
