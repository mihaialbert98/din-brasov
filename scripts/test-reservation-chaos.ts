/**
 * CHAOS: randomly interleaves owner setting changes with client and staff bookings,
 * re-checking the safety invariant after EVERY single action.
 *
 * The scripted tests prove the cases we thought of. This one looks for the ones we
 * didn't: an owner deleting a table while a client is booking, the duration rule
 * flipping between two bookings, a zone toggle in the middle of a busy service.
 *
 * Invariants checked after every action:
 *   I1  no two bookings sharing a table overlap in time (each per its OWN duration)
 *   I2  a booking accepted through the CLIENT gate never lands on a table that is
 *       already occupied during its window
 *   I3  every booking carries a positive duration and a party of at least 1
 *   I4  a client booking never uses a table held back for walk-ins
 *
 * Deterministic: a seeded PRNG, so a failure is reproducible from the printed seed.
 *
 * Run: pnpm tsx scripts/test-reservation-chaos.ts [seed] [runs]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  availabilityForDay, validateBooking, createManualReservation, updateReservation,
  backfillTableAssignments, bookingsSeatedAtTable, getReservationConfig, getReservationTables,
} from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log(`  ✗ ${m}`); fail++; } else pass++; };
const P = "chaos-";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** Deterministic PRNG (mulberry32) so any failure can be replayed from its seed. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

/** Mirrors DELETE /reservation-tables. */
async function deleteTableLikeRoute(rid: string, tableId: string) {
  const affected = await bookingsSeatedAtTable(rid, tableId);
  if (affected.length > 0) {
    await db.update(reservations).set({ assignedTableIds: null, updatedAt: new Date() }).where(inArray(reservations.id, affected.map((b) => b.id)));
  }
  await db.delete(reservationTables).where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, rid)));
  await backfillTableAssignments(rid);
}

type Booking = { id: string; date: string; time: string; partySize: number; turnMinutes: number | null; assignedTableIds: string | null; guestName: string };

async function allBookings(rid: string): Promise<Booking[]> {
  return db
    .select({ id: reservations.id, date: reservations.date, time: reservations.time, partySize: reservations.partySize, turnMinutes: reservations.turnMinutes, assignedTableIds: reservations.assignedTableIds, guestName: reservations.guestName })
    .from(reservations)
    .where(and(eq(reservations.restaurantId, rid), inArray(reservations.status, ["pending", "confirmed"])));
}

/** I1 + I3 — checked after every action. Returns a description of the first breach. */
function checkInvariants(rows: Booking[], standardTurn: number): string | null {
  for (const b of rows) {
    const turn = b.turnMinutes ?? standardTurn;
    if (!(turn > 0)) return `booking ${b.guestName} has a non-positive duration (${turn})`;
    if (!(b.partySize >= 1)) return `booking ${b.guestName} has party size ${b.partySize}`;
  }
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.date !== b.date) continue;
      const aT: string[] = JSON.parse(a.assignedTableIds ?? "[]");
      const bT: string[] = JSON.parse(b.assignedTableIds ?? "[]");
      const shared = aT.filter((t) => bT.includes(t));
      if (shared.length === 0) continue;
      const aS = toMin(a.time), aE = aS + (a.turnMinutes ?? standardTurn);
      const bS = toMin(b.time), bE = bS + (b.turnMinutes ?? standardTurn);
      if (aS < bE && bS < aE) {
        return `CLASH on a shared table: ${a.guestName} ${a.date} ${a.time}(+${a.turnMinutes ?? standardTurn}) vs ${b.guestName} ${b.time}(+${b.turnMinutes ?? standardTurn})`;
      }
    }
  }
  return null;
}

async function runOnce(seed: number, actions: number): Promise<boolean> {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const dow = 3;
  const date = dateForDow(dow);

  const [pl] = await db.insert(places).values({ name: `Chaos ${seed}`, description: "t", slug: `${P}${seed}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: `Chaos ${seed}`, slug: `${P}${seed}`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxPartySize: 20,
    reservationMaxJoin: 2, reservationLongTurnEnabled: true, reservationLongTurnFromParty: 5,
    reservationLongTurnMinutes: 120, reservationAllowReducedTurn: true,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  await db.insert(reservationHours).values({ restaurantId: r, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 24 });

  let tableIds: string[] = [];
  for (const [label, seats, joinable] of [["C1", 2, true], ["C2", 4, true], ["C3", 6, false], ["C4", 6, false]] as const) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r, label, seats, joinable }).returning({ id: reservationTables.id });
    tableIds.push(t.id);
  }

  const times = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
  const parties = [2, 3, 4, 5, 6, 8];
  let n = 0;
  let clientBookings = 0;

  for (let step = 0; step < actions; step++) {
    const action = pick([
      "client-book", "client-book", "client-book", "staff-book", "staff-force", "staff-edit",
      "del-table", "add-table", "hold-table", "release-table",
      "toggle-long", "change-threshold", "change-turn", "toggle-reduced", "switch-mode",
    ]);

    try {
      if (action === "client-book") {
        const time = pick(times), party = pick(parties);
        const av = await availabilityForDay(r, date, party);
        const reduced = av.reducedSlots.includes(time);
        if (!av.slots.includes(time) && !reduced) continue;
        const v = await validateBooking(r, date, time, party, undefined, undefined, { acceptReducedTurn: reduced });
        if (!v.ok) continue;
        // I2 + I4: what the client gate handed out must be genuinely free and online.
        const onlineIds = new Set((await getReservationTables(r)).map((t) => t.id));
        const cfg0 = await getReservationConfig(r);
        const existing = await allBookings(r);
        const start = toMin(time), end = start + (v.turnMinutes ?? cfg0.turn);
        for (const tid of v.assignedTableIds ?? []) {
          ok(onlineIds.has(tid), `[seed ${seed} step ${step}] client got a table that is not bookable online`);
          for (const e of existing) {
            if (e.date !== date) continue;
            if (!JSON.parse(e.assignedTableIds ?? "[]").includes(tid)) continue;
            const eS = toMin(e.time), eE = eS + (e.turnMinutes ?? cfg0.turn);
            ok(!(start < eE && eS < end), `[seed ${seed} step ${step}] client gate handed out an OCCUPIED table`);
          }
        }
        await db.insert(reservations).values({
          restaurantId: r, date, time, partySize: party, guestName: `client-${n++}`, guestPhone: "0700000000",
          status: "confirmed", turnMinutes: v.turnMinutes ?? null,
          assignedTableIds: v.assignedTableIds ? JSON.stringify(v.assignedTableIds) : null,
        });
        clientBookings++;
      } else if (action === "staff-book" || action === "staff-force") {
        await createManualReservation(r, { date, time: pick(times), partySize: pick(parties), guestName: `staff-${n++}`, guestPhone: "0711111111" }, action === "staff-force");
      } else if (action === "staff-edit") {
        const rows = await allBookings(r);
        if (rows.length === 0) continue;
        const b = pick(rows);
        await updateReservation(r, b.id, { date, time: pick(times), partySize: pick(parties) }, rand() < 0.5);
      } else if (action === "del-table") {
        const live = await db.select({ id: reservationTables.id }).from(reservationTables).where(eq(reservationTables.restaurantId, r));
        if (live.length <= 1) continue;
        await deleteTableLikeRoute(r, pick(live).id);
      } else if (action === "add-table") {
        const [t] = await db.insert(reservationTables).values({ restaurantId: r, label: `X${n++}`, seats: pick([2, 4, 6]), joinable: rand() < 0.5 }).returning({ id: reservationTables.id });
        tableIds.push(t.id);
        await backfillTableAssignments(r);
      } else if (action === "hold-table" || action === "release-table") {
        const live = await db.select({ id: reservationTables.id }).from(reservationTables).where(eq(reservationTables.restaurantId, r));
        if (live.length === 0) continue;
        await db.update(reservationTables).set({ bookableOnline: action === "release-table" }).where(eq(reservationTables.id, pick(live).id));
      } else if (action === "toggle-long") {
        await db.update(restaurants).set({ reservationLongTurnEnabled: rand() < 0.5 }).where(eq(restaurants.id, r));
      } else if (action === "change-threshold") {
        await db.update(restaurants).set({ reservationLongTurnFromParty: pick([3, 5, 7, 9]) }).where(eq(restaurants.id, r));
      } else if (action === "change-turn") {
        await db.update(restaurants).set({ reservationTurnMinutes: pick([60, 90, 120]), reservationLongTurnMinutes: pick([120, 150, 180]) }).where(eq(restaurants.id, r));
      } else if (action === "toggle-reduced") {
        await db.update(restaurants).set({ reservationAllowReducedTurn: rand() < 0.5 }).where(eq(restaurants.id, r));
      } else if (action === "switch-mode") {
        const mode = rand() < 0.5 ? "seats" : "tables";
        const [before] = await db.select({ m: restaurants.reservationCapacityMode }).from(restaurants).where(eq(restaurants.id, r));
        await db.update(restaurants).set({ reservationCapacityMode: mode }).where(eq(restaurants.id, r));
        if (mode === "tables" && before.m !== "tables") await backfillTableAssignments(r);
      }
    } catch (e) {
      ok(false, `[seed ${seed} step ${step}] action "${action}" threw: ${(e as Error).message}`);
      break;
    }

    const cfg = await getReservationConfig(r);
    const breach = checkInvariants(await allBookings(r), cfg.turn);
    if (breach) {
      ok(false, `[seed ${seed} step ${step}] after "${action}": ${breach}`);
      return false;
    }
  }

  const finalRows = await allBookings(r);
  console.log(`  seed ${String(seed).padEnd(5)} → ${actions} actions, ${finalRows.length} bookings (${clientBookings} via the client gate), invariants held`);
  pass++;
  return true;
}

async function main() {
  await cleanup();
  const baseSeed = Number(process.argv[2] ?? 1);
  const runs = Number(process.argv[3] ?? 8);
  console.log(`\n=== Chaos: ${runs} independent runs × 60 actions ===`);
  for (let i = 0; i < runs; i++) {
    const okRun = await runOnce(baseSeed + i * 7919, 60);
    if (!okRun) break;
  }
  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
