/**
 * Event date + OPTIONAL hour: the admin edit form's load → edit → save round trip.
 *
 * The bug this locks down: the edit page fed a date-only value ("2026-08-05") into a
 * `datetime-local` input, which renders BLANK for anything without a time part — so
 * opening an event whose end date had no hour showed an empty field, and saving wiped
 * the end date. Both date fields now split into a date input + an optional time input.
 *
 * Replicates the page's exact state helpers (localDate / localDateTime / joinDateTime)
 * and the payload it PATCHes, against real rows.
 *
 * Throwaway events (slug evdt-*), self-cleaning.
 *
 * Run: pnpm tsx scripts/test-event-datetime.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import { db } from "../lib/db";
import { events } from "../lib/db/schema";
import { eq, like } from "drizzle-orm";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);
const P = "evdt-";

// ── The admin page's helpers, copied verbatim ────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: string | Date) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const localDateTime = (d: string | Date) => {
  const x = new Date(d);
  return `${localDate(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const joinDateTime = (date: string, time: string) => (date && time ? `${date}T${time}` : date);

/** What the edit page puts in state after loading an event (mirrors the useEffect). */
function loadIntoForm(row: { startsAt: Date; endsAt: Date | null; startsAtHasTime: boolean; endsAtHasTime: boolean }) {
  const startsAt = row.startsAt ? (row.startsAtHasTime === false ? localDate(row.startsAt) : localDateTime(row.startsAt)) : "";
  const endsAt = row.endsAt ? (row.endsAtHasTime === false ? localDate(row.endsAt) : localDateTime(row.endsAt)) : "";
  const [sDate = "", sTime = ""] = startsAt.split("T");
  const [eDate = "", eTime = ""] = endsAt.split("T");
  return { startsAt, endsAt, sDate, sTime, eDate, eTime };
}

/** What the edit page PATCHes on save. */
function savePayload(startsAt: string, endsAt: string) {
  return {
    startsAt: startsAt || undefined,
    startsAtHasTime: startsAt ? startsAt.includes("T") : undefined,
    endsAt: endsAt || null,
    endsAtHasTime: endsAt ? endsAt.includes("T") : undefined,
  };
}

async function cleanup() {
  await db.delete(events).where(like(events.slug, `${P}%`));
}

async function makeEvent(key: string, startsAt: Date, endsAt: Date | null, sHas: boolean, eHas: boolean) {
  const [e] = await db.insert(events).values({
    title: `EvDT ${key}`, description: "t", slug: `${P}${key}`, status: "published",
    startsAt, endsAt, startsAtHasTime: sHas, endsAtHasTime: eHas,
  }).returning({ id: events.id });
  return e.id;
}

async function main() {
  await cleanup();

  // ── 1. THE REGRESSION: an end date with NO hour ────────────────────────────
  sec("1. Event with an end date but no end hour");
  {
    const id = await makeEvent("noendhour", new Date(2026, 7, 5, 19, 0), new Date(2026, 7, 7, 0, 0), true, false);
    const [row] = await db.select().from(events).where(eq(events.id, id));
    const f = loadIntoForm(row as any);

    ok(f.endsAt === "2026-08-07", `end loads as a bare date — "${f.endsAt}"`);
    // A datetime-local input requires "YYYY-MM-DDTHH:mm"; a bare date renders empty.
    ok(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.endsAt), "…which a datetime-local input could NOT display (this was the bug)");
    ok(f.eDate === "2026-08-07", "the date input is populated");
    ok(f.eTime === "", "…and the hour input is correctly empty");

    // Saving without touching anything must preserve the end date.
    const payload = savePayload(f.startsAt, joinDateTime(f.eDate, f.eTime));
    ok(payload.endsAt === "2026-08-07", "saving untouched keeps the end date (it is no longer wiped)");
    ok(payload.endsAtHasTime === false, "…and it stays marked as having no hour");
  }

  // ── 2. Adding an hour to an end date that had none ─────────────────────────
  sec("2. Adding an end hour");
  {
    const id = await makeEvent("addhour", new Date(2026, 7, 5, 19, 0), new Date(2026, 7, 7, 0, 0), true, false);
    const [row] = await db.select().from(events).where(eq(events.id, id));
    const f = loadIntoForm(row as any);
    const payload = savePayload(f.startsAt, joinDateTime(f.eDate, "22:30")); // owner types an hour
    ok(payload.endsAt === "2026-08-07T22:30", "the hour joins onto the existing date");
    ok(payload.endsAtHasTime === true, "…and the event is now marked as having an end hour");
  }

  // ── 3. Clearing the hour but keeping the date ──────────────────────────────
  sec("3. Clearing an end hour");
  {
    const id = await makeEvent("clearhour", new Date(2026, 7, 5, 19, 0), new Date(2026, 7, 7, 22, 30), true, true);
    const [row] = await db.select().from(events).where(eq(events.id, id));
    const f = loadIntoForm(row as any);
    ok(f.eDate === "2026-08-07" && f.eTime === "22:30", "both parts load");
    const payload = savePayload(f.startsAt, joinDateTime(f.eDate, "")); // owner clears the hour
    ok(payload.endsAt === "2026-08-07", "clearing the hour keeps the date");
    ok(payload.endsAtHasTime === false, "…and flips the flag back to date-only");
  }

  // ── 4. Clearing the end date entirely ──────────────────────────────────────
  sec("4. Removing the end date");
  {
    const payload = savePayload("2026-08-05T19:00", joinDateTime("", ""));
    ok(payload.endsAt === null, "an empty date sends null — the end date is removed deliberately");
  }

  // ── 5. Start date: same rules ──────────────────────────────────────────────
  sec("5. Start date with and without an hour");
  {
    const id = await makeEvent("startnohour", new Date(2026, 7, 5, 0, 0), null, false, true);
    const [row] = await db.select().from(events).where(eq(events.id, id));
    const f = loadIntoForm(row as any);
    ok(f.sDate === "2026-08-05" && f.sTime === "", "a start with no hour loads as date-only");
    ok(savePayload(joinDateTime(f.sDate, f.sTime), "").startsAtHasTime === false, "…and saves back as date-only");
    ok(savePayload(joinDateTime(f.sDate, "18:00"), "").startsAtHasTime === true, "adding an hour flips the flag");
  }

  // ── 6. No UTC drift near midnight ──────────────────────────────────────────
  sec("6. Events near midnight don't shift a day (local parts, not UTC)");
  {
    // Both edges of the day. In Romania (UTC+2/+3) it's the EARLY-MORNING one that
    // toISOString() rolls back to the previous day — the original bug in this form.
    for (const [key, h, m, want] of [["latenight", 23, 30, "2026-08-05"], ["earlymorning", 0, 30, "2026-08-06"]] as const) {
      const id = await makeEvent(key, new Date(2026, 7, want.endsWith("06") ? 6 : 5, h, m), null, true, true);
      const [row] = await db.select().from(events).where(eq(events.id, id));
      const f = loadIntoForm(row as any);
      ok(f.sDate === want, `${pad(h)}:${pad(m)} → shows ${want} — got ${f.sDate}`);
      ok(f.sTime === `${pad(h)}:${pad(m)}`, `…and keeps the hour — got ${f.sTime}`);
    }
    // Show what the naive path would have produced, wherever this machine happens to
    // be. Only assert when the two genuinely differ, so the test isn't TZ-dependent.
    const early = new Date(2026, 7, 6, 0, 30);
    const utcDay = early.toISOString().slice(0, 10);
    console.log(`    (this machine: toISOString() would say ${utcDay}; local parts say ${localDate(early)})`);
    if (utcDay !== localDate(early)) {
      ok(localDate(early) === "2026-08-06", "…and the local-parts helper is the one that's right");
    }
  }

  await cleanup();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
