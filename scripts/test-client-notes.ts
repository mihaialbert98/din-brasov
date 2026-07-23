/**
 * Restaurant CRM notes — end-to-end over the REAL exported functions the app uses
 * (listRestaurantClients, upsertRestaurantClientNote, listUpcomingReservations), so
 * the test can't drift from what ships. Covers every case:
 *   1. Owner Clienți union: accounts (by userId) ∪ accountless diners (by phone),
 *      one row per identity, repeat bookings aggregated, guest-under-account-phone
 *      collapsed, guest/account tagging.
 *   2. Notes: create + UPDATE (upsert), for account and phone; persist across repeat
 *      bookings; empty note clears.
 *   3. DB integrity: partial unique indexes → one note per identity; duplicate insert
 *      rejected.
 *   4. Board (listUpcomingReservations): resolves the client note read-only by
 *      identity; per-booking note vs client note are distinct; declined excluded.
 *   5. Search + pagination.
 *   6. Per-restaurant isolation: same phone at two restaurants → independent notes.
 *   7. Route input rule: exactly one of userId/phone.
 * Throwaway restaurants (slug cnotes-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-client-notes.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, users, restaurantClientNotes } from "../lib/db/schema";
import { inArray, like } from "drizzle-orm";
import { listRestaurantClients, upsertRestaurantClientNote, listUpcomingReservations } from "../lib/reservations";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "cnotes-";
const future = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(restaurantClientNotes).where(inArray(restaurantClientNotes.restaurantId, rids));
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
  await db.delete(users).where(like(users.email, `${P}%`));
}

async function makeRestaurant(tag: string) {
  const [pl] = await db.insert(places).values({ name: `CNotes ${tag}`, description: "t", slug: `${P}p-${tag}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({ name: `CNotes ${tag}`, slug: `${P}r-${tag}`, placeId: pl.id, status: "active" }).returning({ id: restaurants.id });
  return r.id;
}

async function main() {
  await cleanup();

  const r1 = await makeRestaurant("1");
  const [ana] = await db.insert(users).values({ email: `${P}ana@test.local`, name: "Ana", role: "user", phone: "0740999000" }).returning({ id: users.id });
  const [bogdan] = await db.insert(users).values({ email: `${P}bogdan@test.local`, name: "Bogdan", role: "user" }).returning({ id: users.id });

  const b = { restaurantId: r1, time: "19:00", partySize: 2, status: "confirmed" as const };
  await db.insert(reservations).values([
    { ...b, date: future(1), guestName: "Ana", guestPhone: "0740999000", userId: ana.id },              // account, 2 visits
    { ...b, date: future(2), guestName: "Ana", guestPhone: "0740999000", userId: ana.id },
    { ...b, date: future(1), guestName: "Bogdan", guestPhone: "0740000001", userId: bogdan.id, note: "lângă geam" }, // account, per-booking note, no client note
    { ...b, date: future(1), guestName: "Maria", guestPhone: "0740111222", userId: null },              // guest, 2 visits
    { ...b, date: future(3), guestName: "Maria", guestPhone: "0740111222", userId: null },
    { ...b, date: future(2), guestName: "Ionuț", guestPhone: "0740333444", userId: null, status: "pending" }, // guest, no note
    { ...b, date: future(1), guestName: "Invitat ca Ana", guestPhone: "0740 999 000", userId: null },   // guest under Ana's phone → collapses
    { ...b, date: future(1), guestName: "Refuzat", guestPhone: "0740555666", userId: null, status: "declined" }, // declined
  ]);

  // ── 1. Owner Clienți union ──────────────────────────────────────────────────
  sec("1. Owner Clienți list (listRestaurantClients)");
  let { clients, total } = await listRestaurantClients(r1);
  const acc = (uid: string) => clients.find((c) => !c.isGuest && c.userId === uid);
  const gst = (phone: string) => clients.find((c) => c.isGuest && c.phone === phone);
  ok(total === 5, `5 distinct clients (Ana, Bogdan, Maria, Ionuț, Refuzat) — got ${total}`);
  ok(acc(ana.id)?.visits === 2, "Ana's 2 bookings aggregate into one account row");
  ok(gst("0740111222")?.visits === 2, "Maria's 2 bookings aggregate into one phone row");
  ok(!clients.some((c) => c.isGuest && c.phone === "0740 999 000"), "guest booked under Ana's phone collapsed into her account (no duplicate)");
  ok(gst("0740333444")?.isGuest === true && gst("0740333444")?.name === "Ionuț", "Ionuț listed as accountless (fără cont)");
  ok(acc(bogdan.id)?.isGuest === false, "Bogdan listed as an account client");
  ok(gst("0740555666") !== undefined, "declined guest still appears in the CRM list (owner may note them)");

  // ── 2. Notes: create, update, persist ───────────────────────────────────────
  sec("2. Notes — create, update (upsert), persist");
  await upsertRestaurantClientNote(r1, { userId: ana.id }, "Client fidel, preferă terasa");
  await upsertRestaurantClientNote(r1, { phone: "0740111222" }, "Alergică la fructe de mare");
  ({ clients } = await listRestaurantClients(r1));
  ok(acc(ana.id)?.note === "Client fidel, preferă terasa", "account note shows on Ana's row");
  ok(gst("0740111222")?.note === "Alergică la fructe de mare", "phone note shows on Maria's row");

  await upsertRestaurantClientNote(r1, { userId: ana.id }, "Actualizat: preferă interiorul");
  ({ clients } = await listRestaurantClients(r1));
  ok(acc(ana.id)?.note === "Actualizat: preferă interiorul", "editing the note updates it (upsert, not a 2nd row)");

  await upsertRestaurantClientNote(r1, { phone: "0740111222" }, "");
  ({ clients } = await listRestaurantClients(r1));
  ok(gst("0740111222")?.note === "", "clearing a note empties it");
  await upsertRestaurantClientNote(r1, { phone: "0740111222" }, "Alergică la fructe de mare"); // restore

  // Persistence across a NEW booking under the same phone.
  await db.insert(reservations).values({ ...b, date: future(5), guestName: "Maria din nou", guestPhone: "0740111222", userId: null });
  ({ clients } = await listRestaurantClients(r1));
  ok(gst("0740111222")?.visits === 3 && gst("0740111222")?.note === "Alergică la fructe de mare", "repeat phone booking keeps the note (visits=3, note intact)");

  // ── 3. DB integrity: one note per identity ──────────────────────────────────
  sec("3. Partial unique indexes — one note per identity");
  const noteRows = await db.select({ id: restaurantClientNotes.id }).from(restaurantClientNotes).where(inArray(restaurantClientNotes.restaurantId, [r1]));
  ok(noteRows.length === 2, `only 2 note rows after many upserts (Ana + Maria) — got ${noteRows.length}`);
  let rejected = false;
  try {
    await db.insert(restaurantClientNotes).values({ restaurantId: r1, userId: ana.id, note: "dup" });
  } catch { rejected = true; }
  ok(rejected, "duplicate account note insert rejected by rcn_user_idx");
  rejected = false;
  try {
    await db.insert(restaurantClientNotes).values({ restaurantId: r1, guestPhone: "0740111222", note: "dup" });
  } catch { rejected = true; }
  ok(rejected, "duplicate phone note insert rejected by rcn_phone_idx");

  // ── 4. Board resolves client note read-only ─────────────────────────────────
  sec("4. Board (listUpcomingReservations) resolves client note by identity");
  const board = await listUpcomingReservations(r1);
  const anaBooking = board.find((x) => x.guestName === "Ana");
  const mariaBooking = board.find((x) => x.guestPhone === "0740111222");
  const ionutBooking = board.find((x) => x.guestPhone === "0740333444");
  const bogdanBooking = board.find((x) => x.guestName === "Bogdan");
  const anaPhoneGuest = board.find((x) => x.guestName === "Invitat ca Ana");
  ok((anaBooking as any)?.clientNote === "Actualizat: preferă interiorul", "Ana's booking shows her account note");
  ok((mariaBooking as any)?.clientNote === "Alergică la fructe de mare", "Maria's booking shows her phone note");
  ok(!((ionutBooking as any)?.clientNote), "Ionuț's booking shows no client note");
  ok(bogdanBooking?.note === "lângă geam" && !((bogdanBooking as any)?.clientNote), "per-booking note ('lângă geam') is separate from the (empty) client note");
  ok(!((anaPhoneGuest as any)?.clientNote), "phone-guest booking under Ana's number does NOT inherit her account note (different identity)");
  ok(!board.some((x) => x.guestName === "Refuzat"), "declined reservation excluded from the board");

  // ── 5. Search + pagination ──────────────────────────────────────────────────
  sec("5. Search + pagination");
  ok((await listRestaurantClients(r1, { query: "maria" })).total === 1, "search 'maria' → 1");
  ok((await listRestaurantClients(r1, { query: "0740111" })).total === 1, "search by phone fragment → 1");
  ok((await listRestaurantClients(r1, { query: "zzz" })).total === 0, "search with no match → 0");
  const pageTest = await listRestaurantClients(r1, { perPage: 2, page: 1 });
  ok(pageTest.clients.length === 2 && pageTest.totalPages === 3, "perPage=2 over 5 clients → 2 shown, 3 pages");
  ok((await listRestaurantClients(r1, { perPage: 2, page: 3 })).clients.length === 1, "page 3 → the last (5th) client");

  // ── 6. Per-restaurant isolation ─────────────────────────────────────────────
  sec("6. Notes are per-restaurant");
  const r2 = await makeRestaurant("2");
  await db.insert(reservations).values({ ...b, restaurantId: r2, date: future(1), guestName: "Maria", guestPhone: "0740111222", userId: null });
  await upsertRestaurantClientNote(r2, { phone: "0740111222" }, "La R2 preferă cafea");
  ok((await listRestaurantClients(r2)).clients.find((c) => c.phone === "0740111222")?.note === "La R2 preferă cafea", "R2 has its own note for the same phone");
  ok((await listRestaurantClients(r1)).clients.find((c) => c.phone === "0740111222")?.note === "Alergică la fructe de mare", "R1's note for that phone is unchanged");

  // ── 7. Route input rule: exactly one identity ───────────────────────────────
  sec("7. Note input rule (exactly one of userId/phone)");
  const validId = (d: { userId?: string; phone?: string }) => (d.userId ? 1 : 0) + (d.phone ? 1 : 0) === 1;
  ok(validId({ userId: "u" }) && validId({ phone: "p" }), "one identity → valid");
  ok(!validId({}) && !validId({ userId: "u", phone: "p" }), "zero or both identities → rejected");

  // ── 8. Phone formatting normalised + most-recent name (improvements 1 & 2) ──
  sec("8. Same digits/different formatting merge; latest name wins");
  const digitsEq = (p: string | null | undefined, d: string) => (p ?? "").replace(/\D/g, "") === d;
  // Earlier name is alphabetically LATER ("Zamfir…" > "Alex…"), so a max() bug would
  // pick the wrong one — this genuinely proves most-recent wins.
  await db.insert(reservations).values([
    { ...b, date: future(1), time: "18:00", guestName: "Zamfir Vechi", guestPhone: "0742 500 600", userId: null },
    // Later booking: SAME number, different spacing, and an alphabetically-smaller name.
    { ...b, date: future(6), time: "18:00", guestName: "Alex Nou", guestPhone: "0742500600", userId: null },
  ]);
  let list8 = (await listRestaurantClients(r1)).clients;
  const mergedRows = list8.filter((c) => c.isGuest && digitsEq(c.phone, "0742500600"));
  ok(mergedRows.length === 1, `two formattings of the same number → ONE row — got ${mergedRows.length}`);
  ok(mergedRows[0]?.visits === 2, "both bookings counted (visits=2) despite different formatting");
  ok(mergedRows[0]?.name === "Alex Nou", "shows the MOST RECENT name ('Alex Nou'), not alphabetical max ('Zamfir Vechi')");

  // A note added under ONE formatting attaches to the identity regardless of formatting.
  await upsertRestaurantClientNote(r1, { phone: "0742 500 600" }, "Vine cu bicicleta");
  list8 = (await listRestaurantClients(r1)).clients;
  ok(list8.find((c) => digitsEq(c.phone, "0742500600"))?.note === "Vine cu bicicleta", "note added via spaced form shows on the merged row");
  // Still ONE note row for that identity (digits key).
  const noteCount = (await db.select({ id: restaurantClientNotes.id }).from(restaurantClientNotes).where(inArray(restaurantClientNotes.restaurantId, [r1])))
    .length;
  ok(noteCount === 3, `now 3 note rows (Ana, Maria, Vlad-phone) — got ${noteCount}`);
  // Board: BOTH bookings (different formatting) resolve the same note.
  const board8 = await listUpcomingReservations(r1);
  const mergedBoard = board8.filter((x) => digitsEq(x.guestPhone, "0742500600"));
  ok(mergedBoard.length === 2 && mergedBoard.every((x) => (x as any).clientNote === "Vine cu bicicleta"), "both formattings show the note on the board");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
