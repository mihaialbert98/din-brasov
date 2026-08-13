/**
 * Success-screen wording: the uppercase title, and the auto-confirm toggle that
 * decides whether the guest is told a confirmation email is coming.
 *
 * The whole point is that this changes TEXT ONLY. The toggle must never affect
 * whether the email is sent, whether the booking is confirmed, or anything the
 * reservation engine does — so this asserts the wording flips while the booking
 * behaviour stays identical on both settings.
 *
 * Throwaway restaurant (slug copy-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-success-copy.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { getReservationConfig, validateBooking, addDaysISO } from "../lib/reservations";
import { strings } from "../lib/i18n-reservation";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "copy-";
const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; };

/** Mirrors the success-screen branch in ReservationForm. */
function successMessage(opts: { willEmail: boolean; showEmailNotice: boolean; restaurant: string; lang: "ro" | "en" }) {
  const t = strings(opts.lang);
  return opts.willEmail && opts.showEmailNotice ? t.confirmedWithEmail : t.confirmedNoEmail(opts.restaurant);
}

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

async function main() {
  await cleanup();

  sec("1. Default is unchanged for every existing restaurant");
  const [pl] = await db.insert(places).values({ name: "Copy", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: "Copy", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true, reservationConfirmMode: "auto",
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 12,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  for (const d of [0,1,2,3,4,5,6]) {
    await db.insert(reservationHours).values({ restaurantId: r, dayOfWeek: d, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 20 });
  }
  ok((await getReservationConfig(r)).showEmailNotice === true, "a restaurant created without the setting defaults to SHOWING the notice");

  sec("2. Toggle ON — the guest is told the email is coming");
  let msg = successMessage({ willEmail: true, showEmailNotice: true, restaurant: "Copy", lang: "ro" });
  ok(/email de confirmare/i.test(msg), `RO mentions the email — "${msg.slice(0, 70)}…"`);
  ok(/Spam/i.test(msg), "…including the spam-folder hint");
  msg = successMessage({ willEmail: true, showEmailNotice: true, restaurant: "Copy", lang: "en" });
  ok(/confirmation email/i.test(msg), `EN mentions the email — "${msg.slice(0, 70)}…"`);

  sec("3. Toggle OFF — the same confirmation, without the email sentence");
  msg = successMessage({ willEmail: true, showEmailNotice: false, restaurant: "Copy", lang: "ro" });
  ok(!/email/i.test(msg), `RO no longer mentions email — "${msg}"`);
  ok(/confirmat/i.test(msg), "…but still says the booking IS confirmed");
  msg = successMessage({ willEmail: true, showEmailNotice: false, restaurant: "Copy", lang: "en" });
  ok(!/email/i.test(msg), `EN no longer mentions email — "${msg}"`);
  ok(/confirmed/i.test(msg), "…but still says the booking IS confirmed");

  sec("4. A guest with no email is unaffected either way");
  const a = successMessage({ willEmail: false, showEmailNotice: true, restaurant: "Copy", lang: "ro" });
  const b = successMessage({ willEmail: false, showEmailNotice: false, restaurant: "Copy", lang: "ro" });
  ok(a === b, "the toggle changes nothing for a guest who left no email");
  ok(!/email/i.test(a), "…and that message never mentioned email anyway");

  sec("5. TEXT ONLY — booking behaviour is identical on both settings");
  const date = addDaysISO(todayISO(), 1);
  const withNotice = await validateBooking(r, date, "19:00", 4);
  await db.update(restaurants).set({ reservationShowEmailNotice: false }).where(eq(restaurants.id, r));
  const withoutNotice = await validateBooking(r, date, "19:00", 4);
  ok((await getReservationConfig(r)).showEmailNotice === false, "the setting really flipped");
  ok(withNotice.ok === withoutNotice.ok && withNotice.ok === true, "the booking is accepted the same way with the notice on and off");
  ok(withNotice.turnMinutes === withoutNotice.turnMinutes, "…the stored duration is identical");
  ok(JSON.stringify(withNotice.assignedTableIds) === JSON.stringify(withoutNotice.assignedTableIds), "…and the table assignment is identical");

  sec("6. Confirm mode is untouched by the toggle");
  const [row] = await db.select({ mode: restaurants.reservationConfirmMode }).from(restaurants).where(eq(restaurants.id, r));
  ok(row.mode === "auto", "the restaurant is still on auto-confirm — bookings still land confirmed");

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
