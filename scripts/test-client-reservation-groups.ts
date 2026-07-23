/**
 * End-to-end "as a diner reserves" test for join-groups: sees live availability
 * (availableSlotsForDay), reserves (validateBooking → the real booking gate) and the
 * assignment is persisted; the next diner then hits occupancy exactly like production.
 * Uses the same functions the /api/reservations/availability + booking POST routes call.
 * Throwaway restaurant (slug clientgrp-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-client-reservation-groups.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, validateBooking } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(t.toISOString().slice(0, 10) + "T00:00:00").getDay() === dow) return t.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
}

async function cleanup() {
  const r = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, "clientgrp-%"));
  const rids = r.map((x) => x.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    const grp = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    if (grp.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, grp.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, rids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, "clientgrp-%"));
}

/** Replays exactly what the booking POST does after a valid slot: insert + assignment. */
async function reserve(rid: string, date: string, time: string, party: number, name: string) {
  const v = await validateBooking(rid, date, time, party);
  if (!v.ok) return { ok: false as const, reason: v.reason };
  await db.insert(reservations).values({
    restaurantId: rid, date, time, partySize: party, guestName: name, guestPhone: "0700000000",
    status: "confirmed", assignedTableIds: v.assignedTableIds ? JSON.stringify(v.assignedTableIds) : null,
  });
  return { ok: true as const, assignedTableIds: v.assignedTableIds! };
}

async function main() {
  await cleanup();

  // A realistic restaurant: a joinable "Salon" of three 2-tops (group), a standalone
  // 4-top, and an ungrouped joinable pair. maxJoin 2, turn 90.
  const dow = 4, date = dateForDow(dow);
  const [pl] = await db.insert(places).values({ name: "ClientGrp", description: "t", slug: "clientgrp-p", category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: "ClientGrp", slug: "clientgrp-r", placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationConfirmMode: "auto", reservationTurnMinutes: 90, reservationMaxJoin: 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: dow, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 0 });
  const id: Record<string, string> = {};
  for (const [label, seats, join] of [["M1", 2, true], ["M2", 2, true], ["M3", 2, true], ["M4", 4, false], ["P1", 2, true], ["P2", 2, true]] as const) {
    const [t] = await db.insert(reservationTables).values({ restaurantId: r.id, label, seats, joinable: join }).returning({ id: reservationTables.id });
    id[label] = t.id;
  }
  const [salon] = await db.insert(reservationTableGroups).values({ restaurantId: r.id, label: "Salon" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values(["M1", "M2", "M3"].map((l) => ({ groupId: salon.id, tableId: id[l] })));

  // ── Diner 1: party of 6 at 19:00 ──────────────────────────────────────────
  sec("Diner 1 — party of 6");
  ok((await availableSlotsForDay(r.id, date, 6)).includes("19:00"), "sees 19:00 available for 6 (Salon 2+2+2)");
  const b1 = await reserve(r.id, date, "19:00", 6, "Grup 6");
  ok(b1.ok && b1.assignedTableIds.length === 3, "reserves 6 → assigned the 3 Salon tables");
  const [row] = await db.select({ a: reservations.assignedTableIds }).from(reservations).where(eq(reservations.restaurantId, r.id)).limit(1);
  const saved = JSON.parse(row.a ?? "[]");
  ok(saved.length === 3 && [id.M1, id.M2, id.M3].every((x) => saved.includes(x)), "reservation persisted the 3 group tables");

  // ── Diner 2: overlapping 19:30 ────────────────────────────────────────────
  sec("Diner 2 — overlaps 19:30 (Salon busy until 20:30)");
  ok(!(await availableSlotsForDay(r.id, date, 6)).includes("19:30"), "party 6 NOT offered 19:30 (Salon taken, nothing else seats 6)");
  const blocked = await reserve(r.id, date, "19:30", 6, "Grup 6b");
  ok(!blocked.ok && !!blocked.reason, "booking 6 at 19:30 is refused with a reason");
  ok((await availableSlotsForDay(r.id, date, 2)).includes("19:30"), "party 2 STILL offered 19:30 (standalone M4 free)");
  const b2 = await reserve(r.id, date, "19:30", 2, "Cuplu");
  ok(b2.ok && b2.assignedTableIds.length === 1, "party 2 reserves a single free table at 19:30");

  // ── Occupancy releases after the turn; oversize refused ────────────────────
  sec("Turn release + oversize");
  ok((await availableSlotsForDay(r.id, date, 6)).includes("21:00"), "Salon free again for 6 at 21:00 (after the 90-min turn)");
  const tooBig = await validateBooking(r.id, date, "21:00", 9);
  ok(!tooBig.ok, "party 9 refused — no table or group seats 9");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
