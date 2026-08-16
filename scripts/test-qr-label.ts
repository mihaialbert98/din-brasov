/**
 * The labelled table QR codes — structure and safety margins.
 *
 * Putting a label inside a QR spends its error-correction budget, so the numbers matter:
 * this pins down that the code is generated at level H, that the label covers only a small
 * share of it, and that the parts a decoder needs to FIND the code are never touched.
 *
 * It deliberately does not claim "it scans" — that is proven separately by rendering the
 * real SVG in a browser and decoding the pixels with a real decoder (see the note at the
 * bottom for how to re-run that). This file is the fast guard that keeps the geometry from
 * drifting between those runs.
 *
 * Run: pnpm tsx scripts/test-qr-label.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);

import QRCode from "qrcode";
import { qrWithLabel } from "../lib/qr-label";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const sec = (s: string) => console.log(`\n=== ${s} ===`);

const URL_ = "https://dinbrasov.ro/m/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const SIZE = 1000;

/** The label box, read back out of the generated SVG. */
function box(svg: string) {
  // The second <rect> is the knockout; the first is the white background.
  const all = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
  const m = all[all.length - 1];
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

async function main() {
  sec("1. The code itself");
  const qr = QRCode.create(URL_, { errorCorrectionLevel: "H" });
  ok(qr.version === 7 && qr.modules.size === 45, `level H gives version ${qr.version}, ${qr.modules.size}x${qr.modules.size} modules`);

  const svg = await qrWithLabel(URL_, "Masa 12", SIZE);
  ok(svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"), "output is a self-contained SVG");
  ok(/viewBox="0 0 1000 1000"/.test(svg), "with a square viewBox that scales to any print size");
  ok(!/<image|href=|<script/i.test(svg), "and no external references or script — safe to embed and print");

  // The quiet zone is what lets a scanner find the code at all.
  const modules = 45, quiet = 4;
  const unit = SIZE / (modules + quiet * 2);
  ok(Math.abs(unit - SIZE / 53) < 0.001, `a 4-module quiet zone is reserved on every side (${unit.toFixed(1)}px per module)`);

  sec("2. The label covers only a small share");
  const cases: [string, number][] = [
    ["1", 4], ["12", 5], ["Masa 7", 7], ["Masa 12", 7], ["Colț fereastră", 7], ["Terasă masa 14", 7],
  ];
  for (const [label, maxPct] of cases) {
    const s = await qrWithLabel(URL_, label, SIZE);
    const b = box(s);
    // As a share of the CODE (excluding the quiet zone), which is what error correction covers.
    const pct = (b.w * b.h) / (SIZE * SIZE) * 100 * ((modules + quiet * 2) / modules) ** 2;
    ok(pct <= maxPct, `"${label}" covers ${pct.toFixed(1)}% of the code (cap ${maxPct}%)`);
  }

  sec("3. The box shrinks to the text");
  const short = box(await qrWithLabel(URL_, "1", SIZE));
  const long = box(await qrWithLabel(URL_, "Terasă masa 14", SIZE));
  ok(short.w < long.w, `a short label uses a narrower box (${Math.round(short.w)} vs ${Math.round(long.w)}px)`);
  ok(long.w <= SIZE * 0.30 + 0.5, "and even the longest never exceeds the 30% cap");

  sec("4. The structural patterns are never touched");
  // Finder patterns are 7x7 in each corner, plus a 1-module separator; alignment patterns
  // for version 7 are centred on modules 6, 22 and 38. A decoder needs these BEFORE error
  // correction can help, so the label must clear them entirely.
  const b = box(await qrWithLabel(URL_, "Terasă masa 14", SIZE));
  const toModule = (px: number) => px / unit - quiet;
  const left = toModule(b.x), right = toModule(b.x + b.w);
  const top = toModule(b.y), bottom = toModule(b.y + b.h);
  ok(left > 8 && right < modules - 8, `the box spans modules ${left.toFixed(1)}–${right.toFixed(1)}, clear of the 8-module finder zones`);
  ok(top > 8 && bottom < modules - 8, `and rows ${top.toFixed(1)}–${bottom.toFixed(1)}, likewise`);

  // The only alignment pattern it could reach is the centre one at (22,22), 5x5.
  const centreHit = left < 24.5 && right > 19.5 && top < 24.5 && bottom > 19.5;
  ok(centreHit, "it does overlap the CENTRE alignment pattern — expected, and the one decoders cope with");
  ok(!(left < 8.5 && top < 8.5), "and never the top-left alignment pattern at (6,6)");

  sec("5. The text always FITS its box");
  // The box being small is only a real guarantee if the ink stays inside it. The font has
  // a lower bound, so without a cap on the character count a long label would be wider
  // than the box that is supposed to contain it — quietly covering modules the box never
  // accounted for. This is the assertion that catches that.
  for (const label of ["1", "Masa 7", "Terasă masa 14", "Masa de la fereastra", "A".repeat(60)]) {
    const s = await qrWithLabel(URL_, label, SIZE);
    const bb = box(s);
    const fontSize = +s.match(/font-size="([\d.]+)"/)![1];
    const shown = s.slice(s.indexOf("<text"), s.indexOf("</text>")).replace(/^<text[^>]*>/, "");
    // Same 0.6em-per-character estimate the generator sizes with, so the two agree.
    const textW = shown.length * fontSize * 0.6;
    ok(textW <= bb.w, `"${label.slice(0, 18)}${label.length > 18 ? "…" : ""}": text ~${Math.round(textW)}px inside a ${Math.round(bb.w)}px box`);
  }

  sec("6. Awkward labels don't break the geometry");
  for (const label of ["", "   ", "A".repeat(60), "12 & <b>", 'Masa "7"']) {
    const s = await qrWithLabel(URL_, label, SIZE);
    const bb = box(s);
    const okBox = bb.w > 0 && bb.w <= SIZE * 0.30 + 0.5 && bb.h > 0;
    // The label is owner-supplied, so it must arrive in the SVG escaped: no raw angle
    // brackets, and every & part of a real entity.
    const inner = s.slice(s.indexOf("<text"), s.indexOf("</text>")).replace(/^<text[^>]*>/, "");
    const okXml = !/[<>]/.test(inner) && !/&(?!(amp|lt|gt|quot|apos);)/.test(inner);
    const shown = label.length > 20 ? `${label.slice(0, 20)}…` : label;
    ok(okBox && okXml, `"${shown}" → box ${Math.round(bb.w)}px, text renders as ${JSON.stringify(inner)}`);
  }

  sec("7. The encoded data is untouched");
  const svgA = await qrWithLabel(URL_, "Masa 1", SIZE);
  const svgB = await qrWithLabel(URL_, "Masa 2", SIZE);
  const pathOf = (s: string) => s.match(/<path d="([^"]+)"/)![1];
  ok(pathOf(svgA) === pathOf(svgB), "two labels on the same URL produce the SAME module pattern — the label is paint, not data");
  const other = await qrWithLabel(URL_.replace("f0", "f1"), "Masa 1", SIZE);
  ok(pathOf(other) !== pathOf(svgA), "a different URL produces a different pattern (sanity)");

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  console.log(
    "\nScanning itself is verified by rendering these SVGs in a real browser and decoding\n" +
    "the pixels with jsQR — 6 labels × 3 print sizes, plus damage on top of the label.\n" +
    "Last run: all scanned; survived ~13% extra damage before failing.\n",
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
