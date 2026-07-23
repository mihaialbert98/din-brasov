/**
 * Verifies the platform-admin restaurant Clienți + email reach:
 *  - covers GUESTS (accountless) who opted into the newsletter, matched by EMAIL;
 *  - dedupes guest emails against accounts; excludes phone-only guests;
 *  - only emails ACTIVE subscribers who opted into LOCALURI (send only what they
 *    consented to); a subscriber to other categories only is listed but not emailable;
 *  - untrusted selections can't bypass the consent gate.
 * Mirrors the exact queries in the clienti page + email-clients route. Self-cleaning.
 *
 * Run: pnpm tsx scripts/test-restaurant-email-reach.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, users, newsletterSubscribers } from "../lib/db/schema";
import { and, eq, isNull, isNotNull, inArray, sql, like } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const P = "emailreach-";

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
  await db.delete(newsletterSubscribers).where(like(newsletterSubscribers.email, `${P}%`));
  await db.delete(users).where(like(users.email, `${P}%`));
}

// Emails (all under the emailreach- prefix so cleanup is safe).
const A = `${P}a@test.local`, B = `${P}b@test.local`, C = `${P}c@test.local`;
const G1 = `${P}g1@test.local`, G2 = `${P}g2@test.local`;
const OUT = `${P}outsider@test.local`;

async function main() {
  await cleanup();

  const [pl] = await db.insert(places).values({ name: "Reach", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({ name: "Reach", slug: `${P}r`, placeId: pl.id, status: "active" }).returning({ id: restaurants.id });

  const [ua] = await db.insert(users).values({ email: A, name: "Client A", role: "user" }).returning({ id: users.id });
  const [ub] = await db.insert(users).values({ email: B, name: "Client B", role: "user" }).returning({ id: users.id });
  const [uc] = await db.insert(users).values({ email: C, name: "Client C", role: "user" }).returning({ id: users.id });

  const base = { restaurantId: r.id, time: "19:00", partySize: 2, guestPhone: "0700000000", status: "confirmed" as const };
  await db.insert(reservations).values([
    { ...base, date: "2026-07-11", guestName: "A", guestEmail: A, userId: ua.id },          // account, subscriber (localuri)
    { ...base, date: "2026-07-10", guestName: "C", guestEmail: C, userId: uc.id },          // account, subscriber to EVENTS only
    { ...base, date: "2026-07-09", guestName: "B", guestEmail: null, userId: ub.id },         // account, NOT subscriber
    { ...base, date: "2026-07-08", guestName: "G1", guestEmail: G1, userId: null },           // guest, subscriber (anon, localuri)
    { ...base, date: "2026-07-07", guestName: "G2", guestEmail: G2, userId: null },           // guest, NOT subscriber
    { ...base, date: "2026-07-06", guestName: "G3", guestEmail: null, userId: null },          // guest, NO email → excluded
    { ...base, date: "2026-07-05", guestName: "G4", guestEmail: A.toUpperCase(), userId: null }, // guest email == account A → deduped
  ]);

  // Active subscribers. `places` = opted into localuri (emailable by a restaurant).
  const sub = (email: string, userId: string | null, places = true) => ({ email, userId, status: "active" as const, wantsEvents: true, wantsPlaces: places, verificationToken: crypto.randomUUID(), verifiedAt: new Date() });
  await db.insert(newsletterSubscribers).values([
    sub(A, ua.id),        // localuri ✓
    sub(G1, null),        // anon guest, localuri ✓
    sub(OUT, null),       // localuri ✓ but NOT a client
    sub(C, uc.id, false), // events only — opted OUT of localuri
  ]);

  // ── Clienți page query (account ∪ email-guests, deduped) ──────────────────
  console.log("\n=== Clienți list (account + email-guests) ===");
  const [accountRows, guestRows] = await Promise.all([
    db.select({
      email: users.email, name: users.name,
      phone: sql<string | null>`coalesce(${users.phone}, max(${reservations.guestPhone}))`,
      visits: sql<number>`count(*)::int`, lastVisit: sql<string>`max(${reservations.date})`,
    }).from(reservations).innerJoin(users, eq(reservations.userId, users.id))
      .where(and(eq(reservations.restaurantId, r.id), isNotNull(reservations.userId)))
      .groupBy(users.id, users.name, users.email, users.phone),
    db.select({
      email: sql<string>`lower(${reservations.guestEmail})`,
      visits: sql<number>`count(*)::int`, lastVisit: sql<string>`max(${reservations.date})`,
    }).from(reservations)
      .where(and(eq(reservations.restaurantId, r.id), isNull(reservations.userId), isNotNull(reservations.guestEmail)))
      .groupBy(sql`lower(${reservations.guestEmail})`),
  ]);
  const accountEmails = new Set(accountRows.map((x) => x.email.toLowerCase()));
  const merged = [
    ...accountRows.map((x) => ({ key: x.email.toLowerCase(), isGuest: false })),
    ...guestRows.filter((x) => x.email && !accountEmails.has(x.email)).map((x) => ({ key: x.email, isGuest: true })),
  ];
  const allEmails = merged.map((m) => m.key);
  const subRows = await db.selectDistinct({ email: sql<string>`lower(${newsletterSubscribers.email})` })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.status, "active"), eq(newsletterSubscribers.wantsPlaces, true), inArray(sql`lower(${newsletterSubscribers.email})`, allEmails)));
  const subSet = new Set(subRows.map((s) => s.email));
  const keys = new Set(merged.map((m) => m.key));

  ok(merged.length === 5, `5 clients (A, B, C, G1, G2) — got ${merged.length}`);
  ok([A, B, C, G1, G2].every((e) => keys.has(e)), "list = {A, B, C, G1, G2}");
  ok(!allEmails.includes("g3") && merged.every((m) => m.key !== ""), "phone-only guest (G3) excluded");
  ok(merged.filter((m) => m.key === A).length === 1, "guest G4 (email==A) deduped into the account row");
  ok(merged.find((m) => m.key === G1)?.isGuest === true, "G1 tagged as guest");
  ok(subSet.size === 2 && subSet.has(A) && subSet.has(G1), `subscribedTotal=2 = {A, G1} (localuri-consented) — got ${subSet.size}`);
  ok(keys.has(C) && !subSet.has(C), "client C (events-only) listed but NOT emailable (opted out of localuri)");
  ok(!subSet.has(OUT), "outsider subscriber (not a client) excluded from total");

  // ── email-clients recipient logic (candidate ∩ active localuri subscribers) ─
  console.log("\n=== Email recipients (localuri-consented; incl. accountless guests) ===");
  async function recipients(sel?: string[]): Promise<string[]> {
    const [acc, gst] = await Promise.all([
      db.selectDistinct({ email: sql<string>`lower(${users.email})` }).from(reservations).innerJoin(users, eq(reservations.userId, users.id))
        .where(and(eq(reservations.restaurantId, r.id), isNotNull(reservations.userId))),
      db.selectDistinct({ email: sql<string>`lower(${reservations.guestEmail})` }).from(reservations)
        .where(and(eq(reservations.restaurantId, r.id), isNull(reservations.userId), isNotNull(reservations.guestEmail))),
    ]);
    let candidate = new Set<string>([...acc, ...gst].map((x) => x.email));
    if (Array.isArray(sel)) { const s = new Set(sel.map((e) => e.toLowerCase())); candidate = new Set([...candidate].filter((e) => s.has(e))); }
    if (candidate.size === 0) return [];
    const rows = await db.select({ email: newsletterSubscribers.email }).from(newsletterSubscribers)
      .where(and(eq(newsletterSubscribers.status, "active"), eq(newsletterSubscribers.wantsPlaces, true), inArray(sql`lower(${newsletterSubscribers.email})`, [...candidate])));
    return rows.map((x) => x.email.toLowerCase()).sort();
  }

  const all = await recipients();
  ok(all.length === 2 && all.includes(A) && all.includes(G1), `ALL → {A, G1} (guest reachable, C excluded) — got [${all.join(", ")}]`);
  ok((await recipients([G1])).join() === G1, "select guest G1 → G1 only");
  ok((await recipients([G2])).length === 0, "select G2 (not subscribed) → 0");
  ok((await recipients([C])).length === 0, "select C (localuri opt-out) → 0");
  ok((await recipients([A, OUT])).join() === A, "select A + outsider → A only (untrusted email can't reach outsider)");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
