/**
 * „Plan de sală” — the HTTP layer and the authorization around it.
 *
 * test-floor-plan.ts proves the RULES (who holds which table, for how long). This proves
 * the way those rules are reached: the request handlers themselves, the permission gates,
 * cross-tenant isolation, and what two staff members clicking at the same time produce.
 *
 * The staff-token handlers are imported and CALLED DIRECTLY with real Request objects —
 * they authenticate by token, not by session, so they run outside a Next request scope.
 * The owner handlers are the same bodies behind `auth()` (which needs next/headers and so
 * can't be invoked here), so their gate is proven through the permission helpers they call,
 * which is the pattern test-security-audit already uses.
 *
 * Proves:
 *   - a bad staff token is 404 — never a leak of another restaurant's room
 *   - malformed query/body is 400, before anything is written
 *   - assigning returns 200 and persists; an empty list clears and is also 200
 *   - a table held by an overlapping booking is 409 with the conflict named
 *   - a table id belonging to ANOTHER restaurant is refused over HTTP
 *   - a cancelled booking can't be assigned to (409), and holds nothing
 *   - the picker payload marks busy tables with who holds them
 *   - CONCURRENCY: two simultaneous assignments of the same table cannot both win
 *   - waiters may assign; only managers may edit the room; outsiders get neither
 *   - a section from another restaurant can never be attached to a table
 *
 * Throwaway data (slug flrapi-*), self-cleaning. No email, no network.
 *
 * Run: pnpm tsx scripts/test-floor-plan-api.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { users, places, restaurants, restaurantMembers, reservations, reservationHours, floorSections, floorTables } from "../lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { canManageRestaurant, canServeRestaurant, authorizeReservationSettings } from "../lib/restaurant-permissions";
import { resolveOwnSection, setFloorTables, getFloorTables } from "../lib/floor-plan";

// The staff-token handlers — callable directly (token auth, no next/headers).
import { GET as statusGET } from "../app/api/s/[token]/reservations/floor-tables/route";
import { PUT as assignPUT } from "../app/api/s/[token]/reservations/[reservationId]/floor-tables/route";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "flrapi-";
const MARK = "@flrapi.test";

function dateForDow(dow: number): string {
  const d = new Date();
  for (let i = 1; i <= 8; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() + i);
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    if (new Date(`${iso}T00:00:00`).getDay() === dow) return iso;
  }
  throw new Error("no date");
}

/** Call a handler the way Next would, and read back status + JSON. */
async function call(
  handler: (req: Request, ctx: any) => Promise<Response>,
  url: string,
  params: Record<string, string>,
  body?: unknown,
) {
  const req = new Request(url, body === undefined
    ? { method: "GET" }
    : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await handler(req, { params: Promise.resolve(params) });
  return { status: res.status, json: await res.json().catch(() => ({})) as any };
}

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(floorTables).where(inArray(floorTables.restaurantId, rids));
    await db.delete(floorSections).where(inArray(floorSections.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(restaurantMembers).where(inArray(restaurantMembers.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
  await db.delete(users).where(like(users.email, `%${MARK}`));
}

async function makeRestaurant(key: string) {
  const slug = `${P}${key}`;
  const [pl] = await db.insert(places).values({
    name: `API ${key}`, description: "test", slug, category: "Restaurant", address: "Brașov", status: "published",
  }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `API ${key}`, slug, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationConfirmMode: "auto", reservationCapacityMode: "seats",
    reservationTurnMinutes: 90, reservationMaxPartySize: 20, reservationAdvanceDays: 60,
  }).returning({ id: restaurants.id, staffToken: restaurants.staffToken });
  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(reservationHours).values({
      restaurantId: r.id, dayOfWeek: dow, startTime: "12:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 200,
    });
  }
  return r;
}

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({
    email: `${email}${MARK}`, name: email, password: await bcrypt.hash("x", 4), role: "user",
  }).returning({ id: users.id });
  return u.id;
}

async function addBooking(restaurantId: string, date: string, time: string, name: string, tableIds: string[] = [], status = "confirmed") {
  const [b] = await db.insert(reservations).values({
    restaurantId, date, time, partySize: 2, guestName: name, guestPhone: "0740000000",
    status, turnMinutes: 90,
    floorTableIds: tableIds.length ? JSON.stringify(tableIds) : null,
  }).returning({ id: reservations.id });
  return b.id;
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("ep-delicate-rain-a2tz6gpo")) {
    throw new Error("Refusing to run: DATABASE_URL is not the DEV branch.");
  }
  await cleanup();

  const D = dateForDow(3);
  const A = await makeRestaurant("a");
  const B = await makeRestaurant("b");

  const [secA] = await db.insert(floorSections).values({ restaurantId: A.id, label: "Sala 1" }).returning({ id: floorSections.id });
  const [secB] = await db.insert(floorSections).values({ restaurantId: B.id, label: "Sala B" }).returning({ id: floorSections.id });
  const [m1] = await db.insert(floorTables).values({ restaurantId: A.id, label: "m1", sectionId: secA.id }).returning({ id: floorTables.id });
  const [m2] = await db.insert(floorTables).values({ restaurantId: A.id, label: "m2", sectionId: secA.id }).returning({ id: floorTables.id });
  const [bTable] = await db.insert(floorTables).values({ restaurantId: B.id, label: "b1", sectionId: secB.id }).returning({ id: floorTables.id });

  const base = (token: string) => `http://localhost/api/s/${token}/reservations/floor-tables`;

  // ── 1. The token gate ─────────────────────────────────────────────────────────
  sec("1. A bad staff token reveals nothing");
  const bad = await call(statusGET, `${base("nope-not-a-token")}?date=${D}&time=19:00&partySize=2`, { token: "nope-not-a-token" });
  ok(bad.status === 404, `unknown token → 404 (got ${bad.status})`);
  ok(!bad.json.tables, "and no room data in the body");

  const badAssign = await call(assignPUT, `http://localhost/api/s/nope/reservations/x/floor-tables`, { token: "nope", reservationId: "x" }, { tableIds: [m1.id] });
  ok(badAssign.status === 404, `assigning with an unknown token → 404 (got ${badAssign.status})`);

  // ── 2. Input validation ───────────────────────────────────────────────────────
  sec("2. Malformed input is refused before anything is written");
  const noQuery = await call(statusGET, base(A.staffToken), { token: A.staffToken });
  ok(noQuery.status === 400, `missing date/time → 400 (got ${noQuery.status})`);
  const badDate = await call(statusGET, `${base(A.staffToken)}?date=16-08-2026&time=19:00&partySize=2`, { token: A.staffToken });
  ok(badDate.status === 400, "a non-ISO date → 400");
  const badTime = await call(statusGET, `${base(A.staffToken)}?date=${D}&time=25:99&partySize=2`, { token: A.staffToken });
  ok(badTime.status === 400, "an impossible time → 400");

  const resId = await addBooking(A.id, D, "19:00", "Client A");
  const badBody = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${resId}/floor-tables`,
    { token: A.staffToken, reservationId: resId }, { tableIds: "m1" });
  ok(badBody.status === 400, `a non-array tableIds → 400 (got ${badBody.status})`);
  const stillNull = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, resId));
  ok(stillNull[0]?.f === null, "and the booking was not touched");

  // ── 3. The happy path, over HTTP ──────────────────────────────────────────────
  sec("3. Assigning, changing and clearing — all through the endpoint");
  const assign = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${resId}/floor-tables`,
    { token: A.staffToken, reservationId: resId }, { tableIds: [m1.id] });
  ok(assign.status === 200 && assign.json.ok, `assigning m1 → 200 (got ${assign.status})`);
  const afterAssign = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, resId));
  ok(JSON.parse(afterAssign[0]?.f ?? "[]")[0] === m1.id, "and it persisted");

  const swap = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${resId}/floor-tables`,
    { token: A.staffToken, reservationId: resId }, { tableIds: [m2.id] });
  ok(swap.status === 200, "swapping m1 → m2 is accepted");
  const afterSwap = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, resId));
  ok(JSON.parse(afterSwap[0]?.f ?? "[]")[0] === m2.id, "and only m2 is left pinned");

  const clear = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${resId}/floor-tables`,
    { token: A.staffToken, reservationId: resId }, { tableIds: [] });
  ok(clear.status === 200 && clear.json.ok, `clearing → 200, not an error (got ${clear.status})`);
  const afterClear = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, resId));
  ok(afterClear[0]?.f === null, "and the column is NULL again");

  // ── 4. Conflicts over HTTP ────────────────────────────────────────────────────
  sec("4. A table held by an overlapping booking is refused, with the reason");
  const holder = await addBooking(A.id, D, "19:00", "Deținător", [m1.id]);
  const other = await addBooking(A.id, D, "20:00", "Suprapus");
  const conflict = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${other}/floor-tables`,
    { token: A.staffToken, reservationId: other }, { tableIds: [m1.id] });
  ok(conflict.status === 409, `→ 409 (got ${conflict.status})`);
  ok(/Deținător/.test(conflict.json.error ?? ""), "the message names who holds it");
  ok(conflict.json.conflicts?.[0]?.label === "m1", "and the conflicts array carries the table");
  const untouched = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, other));
  ok(untouched[0]?.f === null, "the refused booking keeps no assignment");

  // ── 5. Cross-tenant, over HTTP ────────────────────────────────────────────────
  sec("5. Another restaurant's table can't be reached through the endpoint");
  const foreign = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${other}/floor-tables`,
    { token: A.staffToken, reservationId: other }, { tableIds: [bTable.id] });
  ok(foreign.status === 409, `restaurant B's table on A's booking → refused (got ${foreign.status})`);

  const wrongToken = await call(assignPUT, `http://localhost/api/s/${B.staffToken}/reservations/${other}/floor-tables`,
    { token: B.staffToken, reservationId: other }, { tableIds: [bTable.id] });
  ok(wrongToken.status === 404, `B's token on A's booking → 404 (got ${wrongToken.status})`);
  const notMoved = await db.select({ f: reservations.floorTableIds }).from(reservations).where(eq(reservations.id, other));
  ok(notMoved[0]?.f === null, "and nothing was written to A's booking");

  // ── 6. Cancelled bookings ─────────────────────────────────────────────────────
  sec("6. A cancelled booking can't be assigned to");
  const dead = await addBooking(A.id, D, "15:00", "Anulat", [], "cancelled");
  const onDead = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${dead}/floor-tables`,
    { token: A.staffToken, reservationId: dead }, { tableIds: [m2.id] });
  ok(onDead.status === 409, `→ 409 (got ${onDead.status})`);
  const missing = await call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/00000000-0000-0000-0000-000000000000/floor-tables`,
    { token: A.staffToken, reservationId: "00000000-0000-0000-0000-000000000000" }, { tableIds: [m2.id] });
  ok(missing.status === 404, `a reservation that doesn't exist → 404 (got ${missing.status})`);

  // ── 7. The picker payload ─────────────────────────────────────────────────────
  sec("7. The picker is told which tables are busy, and by whom");
  const view = await call(statusGET, `${base(A.staffToken)}?date=${D}&time=20:00&partySize=2&exclude=${other}`, { token: A.staffToken });
  ok(view.status === 200, "the room loads");
  const m1row = view.json.tables?.find((t: any) => t.id === m1.id);
  const m2row = view.json.tables?.find((t: any) => t.id === m2.id);
  ok(m1row?.busy?.guestName === "Deținător", "m1 is marked busy with the holder's name");
  ok(m1row?.busy?.from === "19:00" && m1row?.busy?.to === "20:30", `and the window it's held for (${m1row?.busy?.from}–${m1row?.busy?.to})`);
  ok(m2row?.busy === null, "m2 is free");
  ok(view.json.sections?.length === 1 && view.json.sections[0].label === "Sala 1", "sections come back for grouping");
  ok(!view.json.tables?.some((t: any) => t.id === bTable.id), "restaurant B's table is nowhere in A's payload");

  // ── 8. Two people clicking at once ────────────────────────────────────────────
  //
  // This is a RACE, so one run proves nothing — the first version of this test passed
  // while the code was badly broken. Repeated, because the failure is silent and is
  // exactly what the feature exists to prevent. Before claimFloorTables() existed, this
  // loop measured 39 double-holds out of 40 on the dev branch.
  sec("8. CONCURRENCY — two staff assigning the same table, repeatedly");
  const ROUNDS = 12;
  let bothHeld = 0, exactlyOne = 0, neither = 0, doubleOk = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const raceA = await addBooking(A.id, D, "13:00", `Cursa A${i}`);
    const raceB = await addBooking(A.id, D, "13:30", `Cursa B${i}`); // overlaps 13:00–14:30
    // Alternate single- and multi-table claims: a partial acquire would be just as wrong.
    const want = i % 2 === 0 ? [m2.id] : [m1.id, m2.id];
    const [x, y] = await Promise.all([
      call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${raceA}/floor-tables`, { token: A.staffToken, reservationId: raceA }, { tableIds: want }),
      call(assignPUT, `http://localhost/api/s/${A.staffToken}/reservations/${raceB}/floor-tables`, { token: A.staffToken, reservationId: raceB }, { tableIds: want }),
    ]);
    if (x.status === 200 && y.status === 200) doubleOk++;
    const rows = await db
      .select({ id: reservations.id, f: reservations.floorTableIds })
      .from(reservations)
      .where(inArray(reservations.id, [raceA, raceB]));
    const holding = rows.filter((r) => JSON.parse(r.f ?? "[]").includes(m2.id)).length;
    if (holding === 2) { bothHeld++; console.log(`      round ${i}: BOTH held m2 (${x.status}/${y.status})`); }
    else if (holding === 1) exactlyOne++;
    else neither++;
    await db.delete(reservations).where(inArray(reservations.id, [raceA, raceB]));
  }
  console.log(`      ${ROUNDS} rounds: exactly-one=${exactlyOne} neither=${neither} both=${bothHeld}`);
  ok(bothHeld === 0, `no round ever put two overlapping bookings on one table (${bothHeld} did)`);
  ok(doubleOk === 0, `and two simultaneous assignments never both return 200 (${doubleOk} did)`);
  ok(exactlyOne === ROUNDS, `exactly one winner every round (${exactlyOne}/${ROUNDS}) — the loser is simply left unassigned`);

  // ── 9. Who is allowed to do what ──────────────────────────────────────────────
  sec("9. Permissions: waiters assign, managers edit the room, outsiders neither");
  const ownerId = await makeUser("owner");
  const waiterId = await makeUser("waiter");
  const outsiderId = await makeUser("outsider");
  await db.insert(restaurantMembers).values({ restaurantId: A.id, userId: ownerId, memberRole: "owner" });
  await db.insert(restaurantMembers).values({ restaurantId: A.id, userId: waiterId, memberRole: "waiter" });

  ok(await canServeRestaurant(waiterId, A.id, "user"), "a waiter may reach the board → may assign tables");
  ok(!(await canManageRestaurant(waiterId, A.id, "user")), "but may NOT edit the room (manager-only page)");
  ok(await canManageRestaurant(ownerId, A.id, "user"), "the owner may edit the room");
  ok(!(await canServeRestaurant(outsiderId, A.id, "user")), "an unrelated user may not even see the board");
  ok(!(await canManageRestaurant(outsiderId, A.id, "user")), "nor the room");
  ok(!(await canServeRestaurant(ownerId, B.id, "user")), "A's owner has no access to restaurant B");

  const asOutsider = await authorizeReservationSettings({ user: { id: outsiderId } } as any, "user", A.id);
  ok("error" in asOutsider && asOutsider.status === 403, `the floor-plan routes' gate refuses an outsider (${"error" in asOutsider ? asOutsider.status : "allowed"})`);
  const anon = await authorizeReservationSettings(null, undefined, A.id);
  ok("error" in anon && anon.status === 401, "and a logged-out request gets 401");

  // ── 10. Sections are scoped too ───────────────────────────────────────────────
  sec("10. A table can never be filed under another restaurant's section");
  ok((await resolveOwnSection(A.id, secA.id)) === secA.id, "A's own section resolves");
  ok((await resolveOwnSection(A.id, secB.id)) === null, "B's section resolves to null → „Fără secțiune”, not attached");
  ok((await resolveOwnSection(A.id, "does-not-exist")) === null, "a bogus id resolves to null");
  ok((await resolveOwnSection(A.id, null)) === null, "and null stays null");

  // The DB-level invariant the above protects.
  const aTables = await getFloorTables(A.id);
  const aSectionIds = new Set([secA.id]);
  ok(aTables.every((t) => t.sectionId === null || aSectionIds.has(t.sectionId)), "every one of A's tables sits in one of A's own sections");

  // ── 11. setFloorTables is scoped by restaurant too ────────────────────────────
  sec("11. The lib entry point can't be steered at another restaurant's booking");
  const crossed = await setFloorTables(B.id, resId, [bTable.id]); // resId belongs to A
  ok(!crossed.ok && crossed.status === 404, `B cannot assign to A's reservation (${crossed.ok ? "allowed" : crossed.status})`);

  await cleanup();
  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
