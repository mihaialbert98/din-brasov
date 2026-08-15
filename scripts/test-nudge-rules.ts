/**
 * Repeating notification chime: WHEN staff keep getting nudged.
 *
 * A single chime is easy to miss mid-service, so an unhandled item re-announces
 * itself every 15s until someone acts on it. The rule that matters — and the one
 * that would silently regress — is that reservations only nudge for restaurants
 * that confirm MANUALLY: on auto-confirm nothing is waiting on staff, and a chime
 * every 15 seconds would train them to ignore the sound entirely, which would then
 * cost them the service alerts too.
 *
 * Pure rules, no DB.
 *
 * Run: pnpm tsx scripts/test-nudge-rules.ts
 */
import { serviceNeedsNudge, reservationsNeedNudge, NUDGE_INTERVAL_MS, NUDGE_WORKER_PATH } from "../lib/useRepeatingChime";
import { readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);

sec("1. Interval");
ok(NUDGE_INTERVAL_MS === 15000, `the nudge repeats every 15s — ${NUDGE_INTERVAL_MS}ms`);

sec("2. Service requests — always nudge while a table waits");
ok(serviceNeedsNudge(0) === false, "no open requests → silent");
ok(serviceNeedsNudge(1) === true, "one open request → keeps nudging");
ok(serviceNeedsNudge(7) === true, "several open requests → keeps nudging");

sec("3. Reservations — only where a human must decide");
ok(reservationsNeedNudge(true, 1) === true, "MANUAL confirm + a pending request → nudges");
ok(reservationsNeedNudge(true, 4) === true, "…however many are pending");
ok(reservationsNeedNudge(true, 0) === false, "manual confirm but nothing pending → silent");
ok(reservationsNeedNudge(false, 1) === false, "AUTO confirm + pending rows → SILENT (the key rule)");
ok(reservationsNeedNudge(false, 9) === false, "…even with many rows, auto-confirm never nudges");
ok(reservationsNeedNudge(false, 0) === false, "auto confirm, nothing pending → silent");

sec("4. Accepting the last item stops the nudge");
// The hook is driven by these booleans, so 'stops' == the rule flipping to false.
ok(serviceNeedsNudge(1) && !serviceNeedsNudge(0), "service: 1 → 0 flips the nudge off");
ok(reservationsNeedNudge(true, 1) && !reservationsNeedNudge(true, 0), "reservations: 1 → 0 flips the nudge off");

sec("5. Switching a restaurant to auto-confirm silences pending nudges");
const pending = 3;
ok(reservationsNeedNudge(true, pending) === true, "while manual → nudging");
ok(reservationsNeedNudge(false, pending) === false, "…switched to auto with the same rows → immediately silent");

sec("6. The timer worker");
// The nudge is driven from a Web Worker because browsers throttle page timers on a
// backgrounded tab — which is how a restaurant tablet sits for most of a service.
const workerFile = `public${NUDGE_WORKER_PATH}`;
ok(existsSync(workerFile), `the worker is served from ${NUDGE_WORKER_PATH}`);
const src = existsSync(workerFile) ? readFileSync(workerFile, "utf8") : "";
ok(/self\.onmessage/.test(src), "it listens for messages from the page");
ok(/type === "start"/.test(src) && /type === "stop"/.test(src), "…handling both start and stop");
ok(/setInterval/.test(src) && /clearInterval/.test(src), "…and clears the previous timer so a restart can't stack two");
ok(/postMessage\("tick"\)/.test(src), "…posting a tick back for the page to chime on");
// Check the CODE, not the prose — the file's own comment explains why it can't
// touch audio, so a naive match hits the comment rather than a real call.
const srcNoComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
ok(!/new AudioContext|webkitAudioContext|playChime\s*\(/.test(srcNoComments),
  "the worker never tries to play audio itself (it has no AudioContext)");
ok(/15000/.test(src), "it falls back to 15s if started without an interval");

const hook = readFileSync("lib/useRepeatingChime.ts", "utf8");
ok(/w\.onerror/.test(hook), "a blocked or missing worker is caught…");
ok(/startFallback/.test(hook), "…and falls back to a page timer rather than going silent");
ok(/worker\.terminate\(\)/.test(hook), "the worker is terminated on cleanup — no leak per mount");

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
