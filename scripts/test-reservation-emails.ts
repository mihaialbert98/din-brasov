/**
 * CONFIRMATION EMAILS: prove an email is actually attempted when a reservation is
 * made, and on every later status change — without sending anything.
 *
 * NOTHING LEAVES THIS MACHINE. `globalThis.fetch` is stubbed before any send, so the
 * Resend SDK's HTTP call is captured and answered locally; `RESEND_API_KEY` is also
 * overwritten with a fake value, so even if the stub were bypassed the real account
 * could not be reached. The stub fails loudly on any request to a host other than
 * Resend, so it can't silently let something through.
 *
 * This exercises the REAL POST /api/reservations handler (it takes a plain Request
 * and its auth() call is already fail-safe), so the assertion is about the shipped
 * booking path, not a reimplementation of it.
 *
 * Covers: auto-confirm sends at booking; manual-confirm sends on accept/decline/
 * cancel/edit; the address falls back to the member's account when the guest left
 * the field blank; and a guest with no address anywhere triggers no send (staff
 * phone them instead).
 *
 * Throwaway restaurant (slug mail-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-reservation-emails.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

// ── Network kill-switch: installed BEFORE anything can send ───────────────────
process.env.RESEND_API_KEY = "re_fake_key_for_tests";

type Sent = { to: string; subject: string; html: string };
const sent: Sent[] = [];
const realFetch = globalThis.fetch;

/** The dev Postgres branch — neon-http speaks over fetch, so it has to pass through. */
const isNeon = (url: string) => url.includes("neon.tech");
const isResend = (url: string) => url.includes("api.resend.com");

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (isResend(url)) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    sent.push({ to: String(body.to), subject: String(body.subject), html: String(body.html ?? "") });
    return new Response(JSON.stringify({ id: `fake-${sent.length}` }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (isNeon(url)) return realFetch(input, init);
  // Anything else would be an unexpected outbound call — refuse rather than allow it.
  throw new Error(`BLOCKED unexpected outbound request in test: ${url}`);
}) as typeof fetch;

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, users } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { setReservationStatus, updateReservation, addDaysISO } from "../lib/reservations";

// The route pulls in lib/auth, which (a) opens a DB connection at MODULE LOAD and
// (b) calls next/headers, which throws SYNCHRONOUSLY outside a request scope — so the
// route's own `auth().catch()` can't absorb it. Both are solved by pre-seeding the
// module cache with a double and importing the route lazily, inside main().
//
// The double returns null, which is precisely what auth() yields for a LOGGED-OUT
// guest — the main booking case. So the handler under test is the real shipped one,
// exercised exactly as a guest booking exercises it.
type CreateHandler = (req: Request) => Promise<Response>;
let createReservation: CreateHandler;

function stubAuth() {
  const authPath = require.resolve("../lib/auth");
  require.cache[authPath] = {
    id: authPath, filename: authPath, loaded: true, children: [], paths: [],
    exports: { auth: async () => null },
  } as unknown as NodeJS.Module;
}

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "mail-";

const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; };
/** Emails are fire-and-forget (`void`), so give the microtask a moment to land. */
const settle = () => new Promise((r) => setTimeout(r, 250));

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const ids = rs.map((r) => r.id);
  if (ids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, ids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, ids));
    await db.delete(restaurants).where(inArray(restaurants.id, ids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function makeRestaurant(key: string, confirmMode: "auto" | "manual") {
  const [pl] = await db.insert(places).values({ name: `Mail ${key}`, description: "t", slug: `${P}${key}`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [r] = await db.insert(restaurants).values({
    name: `Mail ${key}`, slug: `${P}${key}`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true, reservationConfirmMode: confirmMode,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
  }).returning({ id: restaurants.id });
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    await db.insert(reservationHours).values({ restaurantId: r.id, dayOfWeek: d, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 30 });
  }
  return r.id;
}

/** Book through the REAL route handler. */
async function bookViaApi(restaurantId: string, body: Record<string, unknown>) {
  const req = new Request("http://localhost:3000/api/reservations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    // elapsed clears the anti-bot timing check; `website` is the honeypot.
    body: JSON.stringify({ restaurantId, website: "", elapsed: 5000, ...body }),
  });
  const res = await createReservation(req);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  stubAuth();
  ({ POST: createReservation } = await import("../app/api/reservations/route") as { POST: CreateHandler });
  await cleanup();
  const date = addDaysISO(todayISO(), 1);

  sec("0. The kill-switch itself works");
  ok(process.env.RESEND_API_KEY === "re_fake_key_for_tests", "the API key is a fake — the real account is unreachable");
  let blocked = false;
  try { await (globalThis.fetch as any)("https://example.com"); } catch { blocked = true; }
  ok(blocked, "any non-Resend outbound request is refused, so nothing can escape");

  // ── 1. Auto-confirm: the email goes out AT BOOKING ─────────────────────────
  sec("1. Auto-confirm — booking sends the confirmation immediately");
  const auto = await makeRestaurant("auto", "auto");
  sent.length = 0;
  let r1 = await bookViaApi(auto, {
    date, time: "19:00", partySize: 2,
    guestName: "Ana Pop", guestPhone: "0740100001", guestEmail: "ana@example.com",
  });
  await settle();
  ok(r1.status === 200, `the booking succeeded (HTTP ${r1.status})`);
  ok(r1.json.status === "confirmed", "…and landed confirmed");
  ok(sent.length === 1, `exactly one email was sent — got ${sent.length}`);
  ok(sent[0]?.to === "ana@example.com", `…to the address the guest typed — ${sent[0]?.to}`);
  ok(/confirmat/i.test(sent[0]?.subject ?? ""), `…with a confirmation subject — "${sent[0]?.subject}"`);
  ok((sent[0]?.html ?? "").includes("19:00"), "…and the body carries the booking time");

  sec("1b. No address anywhere → nothing is sent (staff phone them)");
  sent.length = 0;
  const r2 = await bookViaApi(auto, {
    date, time: "19:30", partySize: 2, guestName: "Fara Email", guestPhone: "0740100002",
  });
  await settle();
  ok(r2.status === 200, "the booking still succeeds without an email address");
  ok(sent.length === 0, `no email attempted — got ${sent.length}`);

  sec("1c. Email failure never breaks the booking");
  // Make Resend reject the way it does for a bad address: 200 with an { error }.
  const prev = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (isResend(url)) {
      return new Response(JSON.stringify({ error: { message: "invalid", name: "validation_error" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (isNeon(url)) return realFetch(input, init);
    throw new Error(`BLOCKED unexpected outbound request in test: ${url}`);
  }) as typeof fetch;
  const r3 = await bookViaApi(auto, {
    date, time: "20:00", partySize: 2, guestName: "Esec Mail", guestPhone: "0740100003", guestEmail: "boom@example.com",
  });
  await settle();
  globalThis.fetch = prev;
  ok(r3.status === 200 && r3.json.status === "confirmed", "a rejected email does NOT fail the booking — it still confirms");
  const [stored] = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.guestName, "Esec Mail"));
  ok(!!stored, "…and the reservation is stored");

  // ── 2. Manual confirm: nothing at booking, email on the decision ───────────
  sec("2. Manual confirm — the email follows the restaurant's decision");
  const manual = await makeRestaurant("manual", "manual");
  sent.length = 0;
  const r4 = await bookViaApi(manual, {
    date, time: "19:00", partySize: 2, guestName: "Radu M", guestPhone: "0740200001", guestEmail: "radu@example.com",
  });
  await settle();
  ok(r4.json.status === "pending", "the booking lands pending, as configured");
  ok(sent.length === 0, "no confirmation is sent yet — the restaurant hasn't decided");

  const [pending] = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.guestName, "Radu M"));
  sent.length = 0;
  await setReservationStatus(manual, pending.id, "confirmed");
  await settle();
  ok(sent.length === 1 && sent[0].to === "radu@example.com", "accepting it sends the confirmation to the guest");
  ok(/confirmat/i.test(sent[0]?.subject ?? ""), `…with the confirmed subject — "${sent[0]?.subject}"`);

  sec("2b. Decline, cancel and edit each notify the guest");
  // NOTE on the declined subject: it is the neutral "Rezervare — <restaurant>", not
  // something like "Rezervare refuzată". Deliberate softening, but it means the guest
  // can't tell from the inbox alone that they were turned down. Asserted as-is so a
  // future change to this wording is a conscious decision, not an accident.
  for (const [label, status, re] of [["declined", "declined", /^Rezervare — /], ["cancelled", "cancelled", /anulat/i]] as const) {
    const [row] = await db.insert(reservations).values({
      restaurantId: manual, date, time: "21:00", partySize: 2, guestName: `G-${label}`,
      guestPhone: "0740200009", guestEmail: `${label}@example.com`, status: "confirmed", turnMinutes: 90,
    }).returning({ id: reservations.id });
    sent.length = 0;
    await setReservationStatus(manual, row.id, status);
    await settle();
    ok(sent.length === 1 && sent[0].to === `${label}@example.com`, `${label} → the guest is emailed`);
    ok(re.test(sent[0]?.subject ?? ""), `…with a matching subject — "${sent[0]?.subject}"`);
  }

  const [toEdit] = await db.insert(reservations).values({
    restaurantId: manual, date, time: "18:00", partySize: 2, guestName: "De Editat",
    guestPhone: "0740200010", guestEmail: "edit@example.com", status: "confirmed", turnMinutes: 90,
  }).returning({ id: reservations.id });
  sent.length = 0;
  const upd = await updateReservation(manual, toEdit.id, { date, time: "18:30", partySize: 3 }, false);
  await settle();
  ok(upd.ok, "the restaurant edited the booking");
  ok(sent.length === 1 && sent[0].to === "edit@example.com", "…and the guest was emailed the new details");
  ok((sent[0]?.html ?? "").includes("18:30"), "…which carry the NEW time");

  // ── 3. Address resolution ──────────────────────────────────────────────────
  sec("3. A logged-in member is emailed even with the field left blank");
  const [member] = await db.insert(reservations).values({
    restaurantId: manual, date, time: "20:30", partySize: 2, guestName: "Membru",
    guestPhone: "0740300001", guestEmail: null, status: "pending", turnMinutes: 90,
    userId: (await db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? null,
  }).returning({ id: reservations.id, userId: reservations.userId });

  if (member.userId) {
    sent.length = 0;
    await setReservationStatus(manual, member.id, "confirmed");
    await settle();
    ok(sent.length === 1, "a member with no booking email is still emailed");
    ok(!!sent[0]?.to && sent[0].to.includes("@"), `…at their account address — ${sent[0]?.to}`);
  } else {
    ok(true, "(no account in the dev DB to link — skipped)");
  }

  sec("3b. Guest with neither email nor account → no send");
  const [none] = await db.insert(reservations).values({
    restaurantId: manual, date, time: "21:30", partySize: 2, guestName: "Doar Telefon",
    guestPhone: "0740300002", guestEmail: null, status: "pending", turnMinutes: 90,
  }).returning({ id: reservations.id });
  sent.length = 0;
  await setReservationStatus(manual, none.id, "confirmed");
  await settle();
  ok(sent.length === 0, "nothing is attempted — this is the case the board's call prompt covers");


  // ── 5. The delivery mechanism itself ───────────────────────────────────────
  // The 13 Aug 2026 production bug: `void send(...)` before returning the response
  // meant Vercel could freeze the invocation with the request to Resend still in
  // flight, so it never left. Nothing in the booking LOGIC was wrong — which is why
  // this test suite passed while production silently dropped confirmations.
  sec("5. Email work is scheduled to survive the response, not left floating");
  {
    const { runAfterResponse } = await import("../lib/after-response");
    let ran = false;
    // Outside a request scope (as here, and in cron scripts), after() is unavailable
    // and the work must be AWAITED — not dropped.
    await runAfterResponse(async () => { await new Promise((r) => setTimeout(r, 30)); ran = true; });
    ok(ran, "outside a request scope the work is awaited, so it always completes");

    let threw = false;
    try { await runAfterResponse(async () => { throw new Error("resend down"); }); } catch { threw = true; }
    ok(!threw, "a failing send never propagates — email stays best-effort");

    const src = await import("node:fs").then((fs) => fs.readFileSync("app/api/reservations/route.ts", "utf8"));
    ok(!/void\s+send/.test(src), "the booking route no longer starts an email with a floating `void`");
    ok(/runAfterResponse\(/.test(src), "…it schedules it through runAfterResponse instead");

    const lib = await import("node:fs").then((fs) => fs.readFileSync("lib/reservations.ts", "utf8"));
    ok(!/void\s+notify/.test(lib), "status-change and edit emails are scheduled too, not floating");
  }

  sec("4. Nothing reached the real Resend account");
  ok(process.env.RESEND_API_KEY === "re_fake_key_for_tests", "the key stayed fake for the whole run");
  console.log(`  ℹ ${sent.length} captured locally in the final block; every send was intercepted, none dispatched`);

  globalThis.fetch = realFetch;
  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { globalThis.fetch = realFetch; console.error("TEST ERROR:", e); process.exit(1); });
