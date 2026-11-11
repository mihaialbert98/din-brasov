/**
 * „Rezervarea a sosit” toggle. Checks: mark/un-mark round-trips; only CONFIRMED
 * bookings can be marked; another restaurant can't mark ours; and — the property that
 * matters — marking arrival changes NOTHING the availability engine reads (status,
 * tables, duration, date/time), so it cannot create or hide an overlap.
 * Throwaway restaurants (slug resarr-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-reservation-arrived.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { setReservationArrived, listUpcomingReservations } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "resarr-";
const today = new Date().toISOString().slice(0, 10);

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function mkRestaurant(tag: string) {
  const [pl] = await db.insert(places).values({ name: `ResArr ${tag}`, description: "t", slug: `${P}p-${tag}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `ResArr ${tag}`, slug: `${P}r-${tag}`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true, reservationCapacityMode: "seats",
  }).returning({ id: restaurants.id });
  return r.id;
}

const snapshot = async (id: string) => {
  const [x] = await db.select().from(reservations).where(eq(reservations.id, id));
  return x;
};

async function main() {
  await cleanup();
  const rid = await mkRestaurant("a");
  const other = await mkRestaurant("b");
  const base = { restaurantId: rid, date: today, time: "19:00", partySize: 2, guestPhone: "0700000000" };
  const [c] = await db.insert(reservations).values({
    ...base, guestName: "C", status: "confirmed", assignedTableIds: JSON.stringify(["t1"]), turnMinutes: 120,
  }).returning({ id: reservations.id });
  const [p] = await db.insert(reservations).values({ ...base, guestName: "P", status: "pending" }).returning({ id: reservations.id });
  const [x] = await db.insert(reservations).values({ ...base, guestName: "X", status: "cancelled" }).returning({ id: reservations.id });

  sec("1. Mark / un-mark a confirmed reservation");
  const before = await snapshot(c.id);
  ok(before.arrivedAt === null, "starts not arrived");
  ok(await setReservationArrived(rid, c.id, true), "mark → true");
  const marked = await snapshot(c.id);
  ok(marked.arrivedAt instanceof Date, "arrived_at set");
  ok(Math.abs(marked.arrivedAt!.getTime() - Date.now()) < 5 * 60_000, "arrived_at ≈ now");
  const listed = (await listUpcomingReservations(rid)).find((r) => r.id === c.id);
  ok(!!listed?.arrivedAt, "board list exposes arrivedAt");
  ok(await setReservationArrived(rid, c.id, false), "un-mark → true");
  ok((await snapshot(c.id)).arrivedAt === null, "arrived_at cleared");

  sec("2. Marking arrival never touches what availability reads");
  await setReservationArrived(rid, c.id, true);
  const after = await snapshot(c.id);
  for (const k of ["status", "date", "time", "partySize", "assignedTableIds", "assignedTablesManual", "floorTableIds", "turnMinutes", "area"] as const) {
    ok(after[k] === before[k], `${k} unchanged (${String(before[k])})`);
  }

  sec("3. Guards");
  ok(!(await setReservationArrived(rid, p.id, true)), "pending → refused");
  ok((await snapshot(p.id)).arrivedAt === null, "pending stays unmarked");
  ok(!(await setReservationArrived(rid, x.id, true)), "cancelled → refused");
  ok(!(await setReservationArrived(other, c.id, false)), "other restaurant → refused");
  ok((await snapshot(c.id)).arrivedAt !== null, "…and our flag is untouched by it");
  ok(!(await setReservationArrived(rid, crypto.randomUUID(), true)), "unknown id → refused");

  await cleanup();
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
