/**
 * Every modal panel must be able to scroll.
 *
 * The overlay is `fixed inset-0`, so a panel taller than the window is simply CLIPPED:
 * the page behind cannot scroll to reveal the rest, and because the panel is centred, its
 * own top goes off the TOP of the viewport — on a 700px-tall laptop the „Adaugă rezervare”
 * dialog lost its date and time fields entirely, with no way to reach them.
 *
 * It is the kind of bug that arrives later, from someone adding one more field to a dialog
 * that fit yesterday, so this is a structural check rather than a test of one screen:
 * every `fixed inset-0 z-50` overlay in the codebase must have a panel that caps its
 * height and scrolls.
 *
 *   max-h-[calc(100dvh-2rem)]  the overlay's p-4 top and bottom; dvh (not vh) so mobile
 *                              browser chrome hiding/showing is followed correctly
 *   overflow-y-auto            scrolls only when it needs to
 *   overscroll-contain         a scroll reaching the end doesn't chain to the page behind
 *
 * Run: pnpm tsx scripts/test-modal-scroll.ts
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * The full opening tag starting at `from`, which may span lines.
 *
 * Brace- and quote-aware on purpose: a naive search for the first ">" stops inside
 * `onClick={(e) => …}` and truncates the tag before it reaches className — which is
 * exactly how the newsletter dialog passed this check while still being broken.
 */
function openingTag(src: string, from: number): string {
  let depth = 0, quote = "";
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(from, i);
  }
  return src.slice(from);
}

const REQUIRED = ["max-h-[calc(100dvh-2rem)]", "overflow-y-auto", "overscroll-contain"];

let pass = 0;
const failures: string[] = [];

const files = execSync('grep -rl "fixed inset-0 z-50" --include="*.tsx" components app', { encoding: "utf8" })
  .trim().split("\n").filter(Boolean).sort();

console.log(`\nChecking modal panels in ${files.length} files\n`);

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("fixed inset-0 z-50")) continue;
    // The panel is the next <div> after the overlay. Read its whole opening tag, which may
    // span several lines and be preceded by a comment, and may be styled bg-white or a
    // brand colour — an earlier version of this scan looked for `bg-white` on a single
    // line and quietly skipped the newsletter dialog, which was genuinely broken.
    const where = `${file}:${i + 1}`;
    const rest = lines.slice(i + 1).join("\n");
    const start = rest.indexOf("<div");
    if (start === -1) { console.log(`  – ${where}: no panel found, skipped`); continue; }
    const panel = openingTag(rest, start);
    const missing = REQUIRED.filter((c) => !panel.includes(c));
    if (missing.length) {
      failures.push(`${where} missing: ${missing.join(" ")}`);
      console.log(`  ✗ ${where} missing ${missing.join(" ")}`);
    } else {
      pass++;
      console.log(`  ✓ ${where}`);
    }
  }
}

console.log(
  failures.length === 0
    ? `\n✅ ${pass} modal panels, all scrollable\n`
    : `\n❌ ${failures.length} modal panel(s) would clip their content:\n   ${failures.join("\n   ")}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
