/**
 * RO/EN for the public reservation surfaces.
 *
 * The build already guarantees the EN dictionary has every RO key (it's typed as
 * `typeof ro`). What TypeScript can NOT catch is a key that was copy-pasted and left
 * in Romanian, a function that ignores its arguments, or a server refusal code with
 * no phrasing. That's what this covers, plus the real server→client contract:
 * `validateBooking` must return a `refusal` code for every refusal, so the form never
 * has to string-match a translated sentence.
 *
 * Throwaway restaurant (slug i18n-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-i18n-reservation.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { places, restaurants, reservations, reservationHours, reservationClosures } from "../lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { validateBooking, addDaysISO, type BookingRefusal } from "../lib/reservations";
import { strings, langFrom, withLang, type Lang } from "../lib/i18n-reservation";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "i18n-";

const todayISO = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const day = (o: number) => addDaysISO(todayISO(), o);

/**
 * Romanian-only characters — a tell that an EN string was never translated. Proper
 * nouns keep their diacritics in English ("Brașov" is spelled the same either way),
 * so they're stripped before the check.
 */
const PROPER_NOUNS = /Bra[șs]ov/g;
const looksRomanian = (s: string) => /[ăâîșțĂÂÎȘȚ]/.test(s.replace(PROPER_NOUNS, ""));

/** Keys whose EN text is legitimately identical to RO (international words). */
const SAME_IN_BOTH = new Set(["email"]);

async function cleanup() {
  const rs = await db.select({ id: restaurants.id }).from(restaurants).where(like(restaurants.slug, `${P}%`));
  const rids = rs.map((r) => r.id);
  if (rids.length) {
    await db.delete(reservations).where(inArray(reservations.restaurantId, rids));
    await db.delete(reservationHours).where(inArray(reservationHours.restaurantId, rids));
    await db.delete(reservationClosures).where(inArray(reservationClosures.restaurantId, rids));
    await db.delete(restaurants).where(inArray(restaurants.id, rids));
  }
  await db.delete(places).where(like(places.slug, `${P}%`));
}

async function main() {
  await cleanup();
  const ro = strings("ro");
  const en = strings("en");

  // ── 1. Language resolution ──────────────────────────────────────────────────
  sec("1. Reading the language off the URL");
  ok(langFrom("en") === "en", `?lang=en → en`);
  ok(langFrom("ro") === "ro", `?lang=ro → ro`);
  ok(langFrom(undefined) === "ro", "no param → Romanian (the default)");
  ok(langFrom("fr") === "ro", "an unknown language falls back to Romanian");
  ok(langFrom(["en", "ro"]) === "en", "a repeated param takes the first value");
  ok(withLang("/localuri/x", "ro") === "/localuri/x", "RO links stay clean (no query string to canonicalise away)");
  ok(withLang("/localuri/x", "en") === "/localuri/x?lang=en", "EN links carry the language");
  ok(withLang("/localuri/x?a=1", "en") === "/localuri/x?a=1&lang=en", "…appending to an existing query string");

  // ── 2. No untranslated leftovers ────────────────────────────────────────────
  sec("2. Every English string is actually English");
  const skip = new Set(["dateLocale", "weekdays"]); // locale id + a list, checked separately
  const leftovers: string[] = [];
  for (const [key, roVal] of Object.entries(ro)) {
    if (skip.has(key)) continue;
    const enVal = (en as Record<string, unknown>)[key];
    if (typeof roVal === "string" && typeof enVal === "string") {
      if (looksRomanian(enVal)) leftovers.push(key);
      if (enVal === roVal && roVal.length > 3 && !SAME_IN_BOTH.has(key)) leftovers.push(`${key} (identical to RO)`);
    }
  }
  ok(leftovers.length === 0, `no untranslated plain strings${leftovers.length ? " — " + leftovers.join(", ") : ""}`);
  for (const k of SAME_IN_BOTH) {
    ok((ro as Record<string, unknown>)[k] === (en as Record<string, unknown>)[k], `"${k}" is deliberately the same word in both languages`);
  }
  ok(en.createAccountBlurb.includes("Brașov") && !looksRomanian(en.createAccountBlurb), "EN copy keeps the city spelled „Brașov” but is otherwise English");
  ok(!en.weekdays.some(looksRomanian), `weekday names are English — ${en.weekdays.join(" ")}`);
  ok(ro.dateLocale === "ro-RO" && en.dateLocale === "en-GB", "each language formats dates with its own locale");

  sec("2b. Sentence builders actually use their arguments");
  const builders: [string, string, string][] = [
    ["noTimes", ro.noTimes(4, "inside"), en.noTimes(4, "inside")],
    ["longPartyNoRoom", ro.longPartyNoRoom(6, "2 ore"), en.longPartyNoRoom(6, "2 hrs")],
    ["fullDurationIntro", ro.fullDurationIntro(6, "2 ore", true), en.fullDurationIntro(6, "2 hrs", true)],
    ["reducedIntro", ro.reducedIntro(false, "1 oră 30 min"), en.reducedIntro(false, "1 hr 30 min")],
    ["reducedIntroStandalone", ro.reducedIntroStandalone(6, "2 ore", "1 oră 30 min", true), en.reducedIntroStandalone(6, "2 hrs", "1 hr 30 min", true)],
    ["durationChosen", ro.durationChosen("2 ore", "19:00", "21:00"), en.durationChosen("2 hrs", "19:00", "21:00")],
    ["durationLarge", ro.durationLarge(6, "2 ore"), en.durationLarge(6, "2 hrs")],
    ["confirmedNoEmail", ro.confirmedNoEmail("Bistro"), en.confirmedNoEmail("Bistro")],
    ["pendingWithEmail", ro.pendingWithEmail("Bistro"), en.pendingWithEmail("Bistro")],
    ["firstFreeDay", ro.firstFreeDay("Saturday"), en.firstFreeDay("Saturday")],
    ["dateTooFar", ro.dateTooFar(30), en.dateTooFar(30)],
    ["until", ro.until("20:00"), en.until("20:00")],
  ];
  for (const [name, roOut, enOut] of builders) {
    ok(!looksRomanian(enOut) && enOut.length > 0 && enOut !== roOut, `${name}: EN differs from RO and reads English — "${enOut.slice(0, 62)}"`);
  }
  ok(en.noTimes(4, "inside").includes("4") && en.noTimes(4, "inside").includes("inside"), "noTimes interpolates the party size and area");
  ok(en.dateTooFar(30).includes("30"), "dateTooFar interpolates the limit");

  sec("2c. English pluralises correctly (Romanian agreement doesn't carry over)");
  ok(en.people(1) === "1 person" && en.people(3) === "3 people", `people(): ${en.people(1)} / ${en.people(3)}`);
  ok(ro.people(1) === "1 persoană" && ro.people(3) === "3 persoane", `RO agreement kept: ${ro.people(1)} / ${ro.people(3)}`);
  ok(en.fullDurationIntro(1, "2 hrs", false).includes("1 person"), "singular party reads „1 person”");
  ok(en.fullDurationIntro(4, "2 hrs", false).includes("4 people"), "plural party reads „4 people”");
  ok(en.fullDurationIntro(4, "2 hrs", true).includes("times below give") && en.fullDurationIntro(4, "2 hrs", false).includes("time below gives"),
    "the VERB agrees too: „times below give” vs „time below gives”");
  ok(en.reducedIntro(true, "1 hr").includes("times below don't") && en.reducedIntro(false, "1 hr").includes("time below doesn't"),
    "…and in the reduced-slot line: „times below don't” vs „time below doesn't”");
  ok(en.reducedIntroStandalone(4, "2 hrs", "1 hr", false).includes("time below doesn't"),
    "…and in the standalone variant");
  ok(en.duration(90) === "1 hr 30 min" && en.duration(120) === "2 hrs" && en.duration(60) === "1 hr", `duration(): ${en.duration(90)} / ${en.duration(120)} / ${en.duration(60)}`);
  ok(ro.duration(90) === "1 oră 30 min" && ro.duration(120) === "2 ore", `RO duration(): ${ro.duration(90)} / ${ro.duration(120)}`);

  // ── 3. Every refusal code has phrasing in both languages ────────────────────
  sec("3. Server refusal codes → localised text");
  const allCodes: BookingRefusal[] = [
    { code: "party_size", max: 12 },
    { code: "area_required" },
    { code: "date_past" },
    { code: "date_too_far", advanceDays: 30 },
    { code: "date_closed" },
    { code: "no_table" },
    { code: "slot_taken" },
  ];
  for (const r of allCodes) {
    const roText = ro.refusal(r);
    const enText = en.refusal(r);
    ok(!!roText && !!enText && !looksRomanian(enText) && roText !== enText, `${r.code}: both languages phrase it — EN "${enText.slice(0, 52)}"`);
  }
  ok(en.refusal({ code: "party_size", max: 8 }).includes("8"), "party_size interpolates the cap");
  ok(en.refusal({ code: "date_too_far", advanceDays: 14 }).includes("14"), "date_too_far interpolates the window");

  // ── 4. The real server contract ─────────────────────────────────────────────
  sec("4. validateBooking returns a code for every public refusal");
  const [pl] = await db.insert(places).values({ name: "I18n", description: "t", slug: `${P}p`, category: "Restaurant", status: "published" }).returning({ id: places.id });
  const [rr] = await db.insert(restaurants).values({
    name: "I18n", slug: `${P}r`, placeId: pl.id, status: "active",
    reservationsEnabledByAdmin: true, reservationsEnabledByOwner: true,
    reservationCapacityMode: "seats", reservationTurnMinutes: 90, reservationMaxPartySize: 8,
    reservationAdvanceDays: 7,
  }).returning({ id: restaurants.id });
  const r = rr.id;
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    await db.insert(reservationHours).values({ restaurantId: r, dayOfWeek: d, startTime: "17:00", endTime: "22:00", slotMinutes: 30, seatsPerSlot: 10 });
  }

  const expectCode = async (label: string, expected: BookingRefusal["code"], call: () => Promise<{ ok: boolean; refusal?: BookingRefusal }>) => {
    const v = await call();
    ok(!v.ok && v.refusal?.code === expected, `${label} → code "${v.refusal?.code ?? "(none)"}" (want "${expected}")`);
    if (v.refusal) {
      const enText = en.refusal(v.refusal);
      ok(!!enText && !looksRomanian(enText), `   …and the form renders it in English: "${enText.slice(0, 58)}"`);
    }
  };

  await expectCode("party of 20 (cap is 8)", "party_size", () => validateBooking(r, day(1), "19:00", 20));
  await expectCode("yesterday", "date_past", () => validateBooking(r, day(-1), "19:00", 2));
  await expectCode("60 days out (window is 7)", "date_too_far", () => validateBooking(r, day(60), "19:00", 2));

  await db.insert(reservationClosures).values({ restaurantId: r, dateFrom: day(2), dateTo: day(2) });
  await expectCode("a closed day", "date_closed", () => validateBooking(r, day(2), "19:00", 2));

  // Fill the seat pool so the slot itself is what fails.
  await db.insert(reservations).values({
    restaurantId: r, date: day(1), time: "19:00", partySize: 10, guestName: "Full", guestPhone: "0700000000",
    status: "confirmed", turnMinutes: 90,
  });
  await expectCode("a full slot", "slot_taken", () => validateBooking(r, day(1), "19:00", 2));

  await db.update(restaurants).set({ reservationAreasEnabled: true }).where(eq(restaurants.id, r));
  await expectCode("no area chosen while zones are on", "area_required", () => validateBooking(r, day(1), "20:30", 2));
  await db.update(restaurants).set({ reservationAreasEnabled: false }).where(eq(restaurants.id, r));

  sec("4b. A successful booking carries no refusal");
  const good = await validateBooking(r, day(3), "19:00", 2);
  ok(good.ok && good.refusal === undefined, "an accepted booking has no refusal code");

  // ── 5. Romanian is untouched ────────────────────────────────────────────────
  sec("5. Romanian is unchanged (it stays the default everywhere)");
  ok(strings("ro" as Lang).bookATable === "Rezervă o masă", "the Romanian heading is intact");
  ok(ro.lateNotice.includes("15 minute"), "the 15-minute notice is intact");
  ok(ro.refusal({ code: "slot_taken" }).includes("nu mai este disponibilă"), "Romanian refusals are unchanged");


  // ── 6. The language carries across the whole restaurant path ────────────────
  sec("6. RO/EN carries from restaurant page → menu → booking form");
  {
    const slug = "bistro-x";
    const hops = [
      ["restaurant page → menu", `/localuri/${slug}/meniu`],
      ["restaurant page → booking", `/localuri/${slug}/rezervare`],
      ["booking form → back to restaurant", `/localuri/${slug}`],
    ] as const;
    for (const [label, path] of hops) {
      ok(withLang(path, "en") === `${path}?lang=en`, `${label}: EN link keeps the language`);
      ok(withLang(path, "ro") === path, `${label}: RO link stays clean`);
    }
    // Whatever the link produces must be what the next page reads back.
    for (const l of ["ro", "en"] as Lang[]) {
      const href = withLang(`/localuri/${slug}/rezervare`, l);
      const param = href.includes("?") ? new URLSearchParams(href.split("?")[1]).get("lang") ?? undefined : undefined;
      ok(langFrom(param) === l, `round trip: a ${l.toUpperCase()} link is read back as ${l.toUpperCase()}`);
    }
  }


  // ── 7. Share cards (owners post these links on social media) ────────────────
  sec("7. Link previews follow the language, but stay ONE canonical URL");
  {
    const { pageMetadata } = await import("../lib/seo");
    const path = "/localuri/bistro-x/rezervare";
    const roMeta = pageMetadata({ title: "Rezervă o masă — Bistro X", description: "Rezervă o masă la Bistro X din Brașov.", path, section: "Localuri" });
    const enMeta = pageMetadata({ title: "Book a table — Bistro X", description: "Book a table at Bistro X in Brașov, Romania.", path, section: "Localuri", locale: "en_GB" });

    ok(String(enMeta.title).startsWith("Book a table"), `EN card title is English — "${enMeta.title}"`);
    ok(!looksRomanian(String(enMeta.openGraph?.description ?? "")), "EN card description is English");
    ok(looksRomanian(String(roMeta.openGraph?.description ?? "")), "RO card description is unchanged");

    // The part that protects SEO and social share counts: both variants declare the
    // SAME canonical and the SAME og:url, so nothing splits across two URLs.
    ok(roMeta.alternates?.canonical === path && enMeta.alternates?.canonical === path,
      `both languages canonicalise to the clean path — ${String(enMeta.alternates?.canonical)}`);
    ok(String(roMeta.openGraph?.url) === String(enMeta.openGraph?.url),
      `og:url is identical in both languages — ${String(enMeta.openGraph?.url)}`);
    ok(!String(enMeta.openGraph?.url).includes("lang="), "og:url never carries the language param");
    ok(enMeta.openGraph?.locale === "en_GB" && roMeta.openGraph?.locale === "ro_RO",
      `each card declares its own og:locale — ${enMeta.openGraph?.locale} / ${roMeta.openGraph?.locale}`);
  }

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
