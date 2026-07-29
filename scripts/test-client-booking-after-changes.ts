/**
 * CLIENT-SIDE end-to-end: a diner books through the real gate (validateBooking, what
 * POST /api/reservations calls) AFTER the owner changed the room. Covers the realistic
 * "stale page" race: the client loaded the slot list, the owner then deleted a table /
 * paused the interval / closed the terrace / deleted a group / switched mode, and the
 * client submits anyway. The server must refuse — the browser's stale list must never
 * be able to oversell. Also checks two clients racing for the last table.
 * Throwaway restaurants (slug cbook-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-client-booking-after-changes.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables, reservationTableGroups, reservationTableGroupMembers } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { availableSlotsForDay, validateBooking } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "cbook-";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dateForDow(dow: number) { const d = new Date(); for (let i = 1; i <= 8; i++) { const t = new Date(d); t.setDate(d.getDate() + i); if (new Date(iso(t) + "T00:00:00").getDay() === dow) return iso(t); } return ""; }

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    const grps = await db.select({ id: reservationTableGroups.id }).from(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, ids));
    if (grps.length) await db.delete(reservationTableGroupMembers).where(inArray(reservationTableGroupMembers.groupId, grps.map((g) => g.id)));
    await db.delete(reservationTableGroups).where(inArray(reservationTableGroups.restaurantId, ids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(reservationTables).where(inArray(reservationTables.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

/** Exactly what POST /api/reservations does: validate, then persist the assignment. */
async function clientBooks(rid: string, date: string, time: string, party: number, name: string, area?: "inside" | "outside") {
  const v = await validateBooking(rid, date, time, party, area);
  if (!v.ok) return { ok: false as const, reason: v.reason };
  await db.insert(reservations).values({
    restaurantId: rid, date, time, partySize: party, guestName: name, guestPhone: "0700000000",
    status: "confirmed", area: area ?? null,
    assignedTableIds: v.assignedTableIds ? JSON.stringify(v.assignedTableIds) : null,
  });
  return { ok: true as const, tables: v.assignedTableIds ?? [] };
}

async function makeRestaurant(tag: string, opts: Partial<{ mode: "seats" | "tables"; areas: boolean; maxJoin: number }> = {}) {
  const [pl] = await db.insert(places).values({ name: `CB${tag}`, description: "t", slug: `${P}p${tag}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `CB${tag}`, slug: `${P}r${tag}`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: opts.mode ?? "tables", reservationAreasEnabled: opts.areas ?? false,
    reservationTurnMinutes: 90, reservationMaxJoin: opts.maxJoin ?? 2, reservationMaxPartySize: 20,
  }).returning({ id: restaurants.id });
  return r.id;
}

async function main() {
  await cleanup();
  const dow = 4, date = dateForDow(dow);

  // ── 1. Owner DELETES a table after the client loaded the page ───────────────
  sec("1. Stale page: owner deletes the table, client submits anyway");
  const r1 = await makeRestaurant("1");
  await db.insert(reservationHours).values({ restaurantId: r1.valueOf(), dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 8 });
  const [t1] = await db.insert(reservationTables).values({ restaurantId: r1, label: "T1", seats: 4 }).returning({ id: reservationTables.id });
  const [t2] = await db.insert(reservationTables).values({ restaurantId: r1, label: "T2", seats: 4 }).returning({ id: reservationTables.id });

  const staleSlots = await availableSlotsForDay(r1, date, 4);           // client's page
  ok(staleSlots.includes("19:00"), "client's page shows 19:00 as free");
  await db.delete(reservationTables).where(eq(reservationTables.id, t1.id)); // owner deletes T1
  await db.delete(reservationTables).where(eq(reservationTables.id, t2.id)); // …and T2
  const afterDelete = await clientBooks(r1, date, "19:00", 4, "Stale client");
  ok(!afterDelete.ok, `submitting the stale slot is REFUSED — "${!afterDelete.ok ? afterDelete.reason : ""}"`);

  // ── 2. Owner PAUSES the interval ────────────────────────────────────────────
  sec("2. Stale page: owner pauses the interval, client submits anyway");
  const r2 = await makeRestaurant("2");
  const [h2] = await db.insert(reservationHours).values({ restaurantId: r2, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 8 }).returning({ id: reservationHours.id });
  await db.insert(reservationTables).values({ restaurantId: r2, label: "T1", seats: 4 });
  ok((await availableSlotsForDay(r2, date, 4)).includes("19:00"), "client's page shows 19:00 as free");
  await db.update(reservationHours).set({ enabled: false }).where(eq(reservationHours.id, h2.id));
  const afterPause = await clientBooks(r2, date, "19:00", 4, "Stale client");
  ok(!afterPause.ok, `paused interval → booking REFUSED — "${!afterPause.ok ? afterPause.reason : ""}"`);
  await db.update(reservationHours).set({ enabled: true }).where(eq(reservationHours.id, h2.id));
  ok((await clientBooks(r2, date, "19:00", 4, "OK client")).ok, "…and after re-enabling, the same booking succeeds");

  // ── 3. Owner CLOSES THE TERRACE (zones off deactivates outside tables) ──────
  sec("3. Stale page: owner closes the terrace, client submits an outside booking");
  const r3 = await makeRestaurant("3", { areas: true });
  await db.insert(reservationHours).values({ restaurantId: r3, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 8, seatsInside: 4, seatsOutside: 4 });
  await db.insert(reservationTables).values({ restaurantId: r3, label: "IN1", seats: 4, area: "inside" });
  await db.insert(reservationTables).values({ restaurantId: r3, label: "OUT1", seats: 4, area: "outside" });
  ok((await availableSlotsForDay(r3, date, 4, "outside")).includes("19:00"), "client's page shows the terrace free at 19:00");
  await db.update(reservationTables).set({ isActive: false }).where(and(eq(reservationTables.restaurantId, r3), eq(reservationTables.area, "outside")));
  const afterClose = await clientBooks(r3, date, "19:00", 4, "Stale client", "outside");
  ok(!afterClose.ok, `terrace closed → outside booking REFUSED — "${!afterClose.ok ? afterClose.reason : ""}"`);
  ok((await clientBooks(r3, date, "19:00", 4, "Inside client", "inside")).ok, "…while the interior still books normally");

  // ── 4. Owner DELETES A GROUP the client's party needed ─────────────────────
  sec("4. Stale page: owner deletes the join-group, client submits a big party");
  const r4 = await makeRestaurant("4", { maxJoin: 1 }); // only a group can join
  await db.insert(reservationHours).values({ restaurantId: r4, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 7 });
  const [g1] = await db.insert(reservationTables).values({ restaurantId: r4, label: "M1", seats: 3, joinable: true }).returning({ id: reservationTables.id });
  const [g2] = await db.insert(reservationTables).values({ restaurantId: r4, label: "M2", seats: 4, joinable: true }).returning({ id: reservationTables.id });
  const [grp] = await db.insert(reservationTableGroups).values({ restaurantId: r4, label: "M1–2" }).returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values([{ groupId: grp.id, tableId: g1.id }, { groupId: grp.id, tableId: g2.id }]);
  ok((await availableSlotsForDay(r4, date, 7)).includes("19:00"), "client's page shows 19:00 free for a party of 7 (via the group)");
  await db.delete(reservationTableGroupMembers).where(eq(reservationTableGroupMembers.groupId, grp.id));
  await db.delete(reservationTableGroups).where(eq(reservationTableGroups.id, grp.id));
  const afterGroup = await clientBooks(r4, date, "19:00", 7, "Stale big party");
  ok(!afterGroup.ok, `group deleted → the 7-person booking is REFUSED — "${!afterGroup.ok ? afterGroup.reason : ""}"`);
  ok((await clientBooks(r4, date, "19:00", 3, "Small party")).ok, "…a party that fits one table still books fine");

  // ── 5. Two clients race for the last table ─────────────────────────────────
  sec("5. Two clients race for the last free table");
  const r5 = await makeRestaurant("5");
  await db.insert(reservationHours).values({ restaurantId: r5, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 4 });
  await db.insert(reservationTables).values({ restaurantId: r5, label: "ONLY", seats: 4 });
  const first = await clientBooks(r5, date, "19:00", 4, "Client A");
  const second = await clientBooks(r5, date, "19:00", 4, "Client B");
  ok(first.ok, "client A books the only table");
  ok(!second.ok, `client B is REFUSED — "${!second.ok ? second.reason : ""}" (no double-booking)`);
  ok((await clientBooks(r5, date, "21:00", 4, "Client C")).ok, "client C books a later slot after the turn — still possible");

  // ── 6. After a MODE SWITCH the client can still book, and correctly ─────────
  sec("6. Client books right after the owner switches seats → tables");
  const r6 = await makeRestaurant("6", { mode: "seats" });
  await db.insert(reservationHours).values({ restaurantId: r6, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 8 });
  await db.insert(reservations).values({ restaurantId: r6, date, time: "19:00", partySize: 4, guestName: "Vechi (seats)", guestPhone: "0700", status: "confirmed" });
  await db.update(restaurants).set({ reservationCapacityMode: "tables" }).where(eq(restaurants.id, r6));
  await db.insert(reservationTables).values({ restaurantId: r6, label: "A", seats: 4 });
  await db.insert(reservationTables).values({ restaurantId: r6, label: "B", seats: 4 });
  const { backfillTableAssignments } = await import("../lib/reservations");
  await backfillTableAssignments(r6); // what the settings route / add-table does
  const newClient = await clientBooks(r6, date, "19:00", 4, "Client nou");
  ok(newClient.ok && newClient.tables.length === 1, "a new client can book and gets a real table");
  const third = await clientBooks(r6, date, "19:00", 4, "Client al treilea");
  ok(!third.ok, "a third party is refused — the carried-over booking holds the other table (no oversell)");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
