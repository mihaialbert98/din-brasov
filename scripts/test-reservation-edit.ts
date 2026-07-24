/**
 * Restaurant edits a reservation (date/time/party). The critical property: the
 * capacity re-check EXCLUDES the reservation being edited, so nudging it within its
 * own window doesn't self-conflict — while OTHER bookings still count. Covers seats
 * mode + tables mode (re-assignment), the force override, notifiableByEmail, the
 * pending/confirmed-only guard, and the no-past guard. Uses the REAL updateReservation.
 * Throwaway restaurants (slug resedit-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-reservation-edit.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { updateReservation } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "resedit-";
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}
const parse = (j: string | null) => { try { return j ? JSON.parse(j) as string[] : []; } catch { return []; } };

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

  // ── Seats mode: seatsPerSlot 6, turn 90 ─────────────────────────────────────
  const [pl] = await db.insert(places).values({ name: "ResEdit", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "ResEdit", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 6 });

  const base = { restaurantId: r.id, status: "confirmed" as const, guestPhone: "0700000000" };
  const [a] = await db.insert(reservations).values({ ...base, date, time: "19:00", partySize: 4, guestName: "A" }).returning({ id: reservations.id });
  await db.insert(reservations).values({ ...base, date, time: "19:00", partySize: 2, guestName: "B" }); // slot now 6/6

  sec("1. Seats mode — exclude-self (own seats don't block, others do)");
  let res = await updateReservation(r.id, a.id, { date, time: "19:00", partySize: 3 }, false);
  ok(res.ok, "shrink A 4→3 at the SAME full slot succeeds (its own 4 seats are excluded)");
  // A=3, B=2 → 5/6. Grow A to 5 → B's 2 + 5 = 7 > 6 → blocked (B still counts).
  res = await updateReservation(r.id, a.id, { date, time: "19:00", partySize: 5 }, false);
  ok(!res.ok && (res as any).overridable, "grow A to 5 fails — other bookings still count (overridable)");
  res = await updateReservation(r.id, a.id, { date, time: "19:00", partySize: 5 }, true);
  ok(res.ok, "force overrides the full slot");
  await updateReservation(r.id, a.id, { date, time: "19:00", partySize: 2 }, true); // reset

  sec("2. Move to a free time + persistence");
  res = await updateReservation(r.id, a.id, { date, time: "21:00", partySize: 2 }, false);
  ok(res.ok, "move A to a free slot (21:00) succeeds");
  const [rowA] = await db.select({ time: reservations.time, partySize: reservations.partySize }).from(reservations).where(eq(reservations.id, a.id));
  ok(rowA.time === "21:00" && rowA.partySize === 2, "new time + party persisted");

  sec("3. notifiableByEmail");
  ok(res.ok && (res as any).notifiableByEmail === false, "guest with no email/account → not notifiable (staff must call)");
  const [c] = await db.insert(reservations).values({ ...base, date, time: "18:00", partySize: 2, guestName: "C", guestEmail: `${P}c@test.local` }).returning({ id: reservations.id });
  const cres = await updateReservation(r.id, c.id, { date, time: "18:00", partySize: 3 }, false);
  ok(cres.ok && (cres as any).notifiableByEmail === true, "guest with an email → notifiable (email sent)");

  sec("4. Guards");
  const [d] = await db.insert(reservations).values({ ...base, date, time: "18:30", partySize: 2, guestName: "D", status: "cancelled" }).returning({ id: reservations.id });
  ok(!(await updateReservation(r.id, d.id, { date, time: "18:30", partySize: 2 }, false)).ok, "a cancelled reservation cannot be edited");
  ok(!(await updateReservation(r.id, a.id, { date: "2020-01-01", time: "19:00", partySize: 2 }, false)).ok, "cannot move to a past date");
  ok(!(await updateReservation(r.id, "nope-id", { date, time: "19:00", partySize: 2 }, false)).ok, "unknown reservation id → not found");

  // ── Tables mode: M1(2), M2(2) joinable, maxJoin 2, turn 90 ──────────────────
  sec("5. Tables mode — exclude-self + re-assignment");
  const [pl2] = await db.insert(places).values({ name: "ResEditT", description: "t", slug: `${P}p2`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r2] = await db.insert(restaurants).values({
    name: "ResEditT", slug: `${P}r2`, placeId: pl2.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r2.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 0 });
  const [m1] = await db.insert(reservationTables).values({ restaurantId: r2.id, label: "M1", seats: 2, joinable: true }).returning({ id: reservationTables.id });
  const [m2] = await db.insert(reservationTables).values({ restaurantId: r2.id, label: "M2", seats: 2, joinable: true }).returning({ id: reservationTables.id });

  // E occupies both tables (party 4 = M1+M2) at 19:00.
  const [e] = await db.insert(reservations).values({ ...base, restaurantId: r2.id, date, time: "19:00", partySize: 4, guestName: "E", assignedTableIds: JSON.stringify([m1.id, m2.id]) }).returning({ id: reservations.id });

  let eres = await updateReservation(r2.id, e.id, { date, time: "19:00", partySize: 2 }, false);
  ok(eres.ok, "shrink E 4→2 at same slot succeeds (its own tables excluded)");
  const [eRow] = await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.id, e.id));
  const eTables = parse(eRow.a);
  ok(eTables.length === 1, `re-assigned to a single table — got ${eTables.length}`);

  // The OTHER table is taken by F; now E can't grow back to 4 (only its own 1 table free).
  const other = [m1.id, m2.id].find((t) => !eTables.includes(t))!;
  await db.insert(reservations).values({ ...base, restaurantId: r2.id, date, time: "19:00", partySize: 2, guestName: "F", assignedTableIds: JSON.stringify([other]) });
  eres = await updateReservation(r2.id, e.id, { date, time: "19:00", partySize: 4 }, false);
  ok(!eres.ok && (eres as any).overridable, "grow E back to 4 fails — the other table is taken by F (overridable)");
  ok((await updateReservation(r2.id, e.id, { date, time: "19:00", partySize: 4 }, true)).ok, "force lets staff override in tables mode");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
