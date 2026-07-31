/**
 * TABLE ZONES: a table must never end up without a zone while „Interior & terasă”
 * is on.
 *
 * The bug (found on a real restaurant): tables created BEFORE zones were enabled kept
 * `area = NULL`. Turning zones on backfilled the per-area SEAT counts on the program
 * intervals but not the tables' areas — and availability filters per area, so those
 * tables matched neither interior nor terasă. Result: 8 interior tables, no bookings,
 * and the client form said interior was full and offered the terrace instead.
 *
 * Locks down the three ways it's now prevented:
 *   - enabling zones assigns `inside` to area-less tables (mirrors the hours backfill)
 *   - creating a table while zones are on defaults to `inside`, never NULL
 *   - the owner can move a table between zones (the UI had no control for this)
 *
 * Throwaway restaurants (slug zones-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-table-zones.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationTables } from "../lib/db/schema";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { availabilityForDay, validateBooking, assignTablesFor, getReservationTables } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "zones-";

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

/**
 * Mirrors PATCH /reservations-settings for the two switches that matter here, with
 * both backfills. The area backfill is keyed on the EFFECTIVE state, so it also runs
 * when the mode changes while zones are already on.
 */
async function patchSettings(rid: string, data: { areasEnabled?: boolean; capacityMode?: "seats" | "tables" }) {
  const [before] = await db
    .select({ mode: restaurants.reservationCapacityMode, areas: restaurants.reservationAreasEnabled })
    .from(restaurants)
    .where(eq(restaurants.id, rid));

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.areasEnabled !== undefined) patch.reservationAreasEnabled = data.areasEnabled;
  if (data.capacityMode !== undefined) patch.reservationCapacityMode = data.capacityMode;
  await db.update(restaurants).set(patch).where(eq(restaurants.id, rid));

  if (data.areasEnabled === true) {
    await db
      .update(reservationHours)
      .set({ seatsInside: 12, seatsOutside: 8 })
      .where(and(eq(reservationHours.restaurantId, rid), isNull(reservationHours.seatsInside)));
  }
  if (data.areasEnabled !== undefined) {
    const mode = data.capacityMode ?? before.mode;
    if (mode === "tables") {
      await db.update(reservationTables).set({ isActive: data.areasEnabled })
        .where(and(eq(reservationTables.restaurantId, rid), eq(reservationTables.area, "outside")));
    }
  }
  const effectiveAreas = data.areasEnabled ?? before.areas;
  if (effectiveAreas && (data.areasEnabled !== undefined || data.capacityMode !== undefined)) {
    await db.update(reservationTables).set({ area: "inside" })
      .where(and(eq(reservationTables.restaurantId, rid), isNull(reservationTables.area)));
  }
}

const setAreas = (rid: string, on: boolean) => patchSettings(rid, { areasEnabled: on });

/** Mirrors POST /reservation-tables — the area defaults to inside when zones are on. */
async function addTableLikeRoute(rid: string, label: string, seats: number, area?: "inside" | "outside") {
  const [rest] = await db.select({ areasEnabled: restaurants.reservationAreasEnabled }).from(restaurants).where(eq(restaurants.id, rid));
  const [t] = await db.insert(reservationTables).values({
    restaurantId: rid, label, seats, joinable: false,
    area: area ?? (rest?.areasEnabled ? "inside" : null),
  }).returning({ id: reservationTables.id });
  return t.id;
}

async function main() {
  await cleanup();
  const dow = 2, date = dateForDow(dow);

  // ── 1. The exact reported scenario ──────────────────────────────────────────
  sec("1. Tables created BEFORE zones were enabled");
  const [pl] = await db.insert(places).values({ name: "Zones", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: "Zones", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
    reservationAreasEnabled: false,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  await db.insert(reservationHours).values({ restaurantId: r, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });

  // Zones OFF: the manager shows no zone selector, so these are created area-less.
  for (const l of ["M1", "M2", "M3"]) await addTableLikeRoute(r, l, 2);
  ok((await db.select().from(reservationTables).where(and(eq(reservationTables.restaurantId, r), isNull(reservationTables.area)))).length === 3,
    "with zones OFF, tables are created without an area (as before)");
  ok((await availabilityForDay(r, date, 2)).slots.length > 0, "…and clients can book normally");

  // Now the owner enables zones — the moment the bug used to appear.
  await setAreas(r, true);
  const areaLess = await db.select().from(reservationTables).where(and(eq(reservationTables.restaurantId, r), isNull(reservationTables.area)));
  ok(areaLess.length === 0, "enabling zones assigns an area to every area-less table (this is the fix)");
  ok((await getReservationTables(r, "inside")).length === 3, "all three land in „interior”");
  ok((await availabilityForDay(r, date, 2, "inside")).slots.length > 0, "…so interior is bookable — the reported symptom is gone");
  ok((await validateBooking(r, date, "19:00", 2, "inside")).ok, "…and the server accepts an interior booking");

  sec("1b. What the bug looked like");
  // Recreate the broken state by hand to prove the diagnosis was right.
  await db.update(reservationTables).set({ area: null }).where(eq(reservationTables.restaurantId, r));
  ok((await getReservationTables(r, "inside")).length === 0, "an area-less table matches NEITHER zone…");
  ok((await getReservationTables(r, "outside")).length === 0, "…not interior, not terasă");
  ok((await availabilityForDay(r, date, 2, "inside")).slots.length === 0, "…so interior looked completely full with zero bookings");
  await setAreas(r, true); // repair, exactly as the settings route now does
  ok((await availabilityForDay(r, date, 2, "inside")).slots.length > 0, "re-running the backfill repairs it");

  // ── 2. Creating tables while zones are ON ───────────────────────────────────
  sec("2. Tables created while zones are ON never lack a zone");
  const t4 = await addTableLikeRoute(r, "M4", 4); // no area given
  const [row4] = await db.select({ area: reservationTables.area }).from(reservationTables).where(eq(reservationTables.id, t4));
  ok(row4.area === "inside", "a table added without a zone defaults to „interior”, not NULL");
  const t5 = await addTableLikeRoute(r, "M5", 4, "outside");
  const [row5] = await db.select({ area: reservationTables.area }).from(reservationTables).where(eq(reservationTables.id, t5));
  ok(row5.area === "outside", "…and an explicit zone is respected");

  // ── 3. Moving a table between zones (the missing control) ───────────────────
  sec("3. The owner can move a table between zones");
  ok((await getReservationTables(r, "outside")).some((t) => t.id === t5), "M5 starts on the terrace");
  await db.update(reservationTables).set({ area: "inside" }).where(eq(reservationTables.id, t5)); // mirrors PATCH { area }
  ok((await getReservationTables(r, "inside")).some((t) => t.id === t5), "moving it to interior takes effect for clients");
  ok(!(await getReservationTables(r, "outside")).some((t) => t.id === t5), "…and it leaves the terrace pool");

  sec("3b. Moving a table does not disturb its bookings");
  await db.update(reservationTables).set({ area: "outside" }).where(eq(reservationTables.id, t5));
  const [booking] = await db.insert(reservations).values({
    restaurantId: r, date, time: "19:00", partySize: 4, guestName: "Terasă", guestPhone: "0700000000",
    status: "confirmed", turnMinutes: 90, area: "outside", assignedTableIds: JSON.stringify([t5]),
  }).returning({ id: reservations.id });
  await db.update(reservationTables).set({ area: "inside" }).where(eq(reservationTables.id, t5));
  const [after] = await db.select().from(reservations).where(eq(reservations.id, booking.id));
  ok(after.status === "confirmed" && after.assignedTableIds === JSON.stringify([t5]), "the existing booking keeps its table and status");
  // The room has other free 4-seaters, so 19:00 stays bookable — what matters is that
  // the MOVED table is not handed to a second party while the first is still on it.
  const pick = await assignTablesFor(r, date, "19:00", 4, "inside", undefined, { channel: "staff" });
  ok(pick !== null && !pick.includes(t5), `19:00 is still bookable inside, but never on the occupied table (got ${pick?.length} table(s), not M5)`);
  await db.delete(reservations).where(eq(reservations.id, booking.id));
  await db.update(reservationTables).set({ area: "outside" }).where(eq(reservationTables.id, t5));

  // ── 4. Zones off → on round trip keeps the assignment ───────────────────────
  sec("4. Turning zones off and on again");
  await setAreas(r, false);
  ok((await getReservationTables(r, undefined, "staff")).every((t) => t.area !== "outside"), "zones off → terrace tables are parked");
  await setAreas(r, true);
  const zonesNow = await db.select({ label: reservationTables.label, area: reservationTables.area }).from(reservationTables).where(eq(reservationTables.restaurantId, r));
  ok(zonesNow.every((t) => t.area === "inside" || t.area === "outside"), "zones back on → every table still has a real zone");
  ok(zonesNow.filter((t) => t.area === "outside").length === 1, "…and the terrace table did not get swept into interior");

  // ── 4b. Zones enabled while still on „capacitate totală” ───────────────────
  // The production path: an owner turns zones on while using total capacity (tables
  // are unused, so nothing looks wrong) and only later switches to individual tables.
  // Keying the backfill on the areas TOGGLE alone skipped this entirely.
  sec("4b. Zones turned on in „capacitate totală”, mode switched afterwards");
  {
    const [pl2] = await db.insert(places).values({ name: "Zones2", description: "t", slug: `${P}p2`, category: "Restaurant", status: "published" }).returning({ id: places.id });
    const [r2] = await db.insert(restaurants).values({
      name: "Zones2", slug: `${P}r2`, placeId: pl2.id, status: "active",
      reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
      reservationCapacityMode: "tables", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
      reservationAreasEnabled: false,
    }).returning({ id: restaurants.id });
    await db.insert(reservationHours).values({ restaurantId: r2.id, dayOfWeek: dow, startTime: "18:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });
    for (const l of ["A1", "A2", "A3"]) await db.insert(reservationTables).values({ restaurantId: r2.id, label: l, seats: 2, area: null });

    await patchSettings(r2.id, { capacityMode: "seats" });   // 1. owner uses total capacity
    await patchSettings(r2.id, { areasEnabled: true });      // 2. enables zones there
    await patchSettings(r2.id, { capacityMode: "tables" });  // 3. switches to individual tables

    const stillNull = await db.select({ label: reservationTables.label }).from(reservationTables)
      .where(and(eq(reservationTables.restaurantId, r2.id), isNull(reservationTables.area)));
    ok(stillNull.length === 0, `no table is left without a zone on this path${stillNull.length ? " — " + stillNull.map((t) => t.label).join(", ") : ""}`);
    ok((await getReservationTables(r2.id, "inside")).length === 3, "all three tables are reachable in interior");
    ok((await availabilityForDay(r2.id, date, 2, "inside")).slots.length > 0, "…and clients can book interior");
  }

  // ── 5. The whole-room invariant ─────────────────────────────────────────────
  sec("5. Every active table is reachable in exactly one zone");
  const all = await getReservationTables(r, undefined, "staff");
  const inside = await getReservationTables(r, "inside", "staff");
  const outside = await getReservationTables(r, "outside", "staff");
  ok(inside.length + outside.length === all.length, `interior (${inside.length}) + terasă (${outside.length}) = every active table (${all.length}) — none is stranded`);
  ok(!inside.some((t) => outside.some((o) => o.id === t.id)), "…and no table is in both");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
