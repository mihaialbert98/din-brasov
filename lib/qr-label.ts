/**
 * A table's QR code with its name printed in the middle.
 *
 * Covering part of a QR is safe because of its Reed–Solomon error correction: the decoder
 * rebuilds the hidden modules. What makes it safe *in practice* is spending that budget
 * deliberately rather than accidentally:
 *
 *   • ERROR CORRECTION "H" (~30% recoverable), not the "M" (~15%) used before. A centred
 *     label eats most of a 15% budget on its own, leaving nothing for the real world —
 *     grease, a scuff, glare, a bent sticker. At H the label costs ~6–11% and the rest is
 *     headroom. The cost is a denser grid (45×45 rather than 33×33 for this URL), so the
 *     printed sticker wants to be generously sized.
 *   • THE CENTRE ONLY. The three corner finder patterns, their separators and the timing
 *     lines that run between them are NOT protected by error correction — a decoder that
 *     can't find them never gets as far as correcting anything. The label is centred and
 *     capped well inside them.
 *   • A SOLID WHITE BOX behind the text. A half-covered module is worse than a fully
 *     covered one: partial ink makes a module ambiguous rather than simply wrong, and
 *     error correction handles "wrong" far better than "maybe".
 *
 * SVG rather than a composited PNG on purpose: no canvas, no native image library, no font
 * files to ship — it stays as serverless-friendly as the plain PNG it replaces, and it
 * scales to any print size without going soft.
 *
 * The ENCODED DATA is unchanged (still the /m/{token} URL), so codes already printed and
 * stuck on tables keep working — this only changes what newly generated ones look like.
 */
import QRCode from "qrcode";

/** Fraction of the code's width the label box may occupy. 0.30 ≈ 9% of the area. */
const BOX_W = 0.30;
/** Fraction of the code's height. Kept shallow — wide and short disturbs fewer rows. */
const BOX_H = 0.16;
/**
 * Longest label rendered before it is cut with an ellipsis.
 *
 * Not cosmetic: the font has a lower bound (below it nothing is readable on a printed
 * sticker anyway), and once that bound binds, a long enough label would be wider than the
 * box that is supposed to contain it — spilling ink onto modules the box never accounted
 * for. Capping the character count keeps the two guarantees compatible: the text always
 * fits the box, and the box is always a small, known share of the code.
 */
const MAX_CHARS = 18;

/** Escape text for inclusion in SVG (labels are owner-supplied). */
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

/**
 * Render `url` as an SVG QR code with `label` in the centre.
 *
 * `size` is the viewBox edge in px; the SVG scales cleanly to any print size regardless.
 * Long labels shrink to fit the box rather than widening it — the box size is the safety
 * property and is never traded away for legibility.
 */
export async function qrWithLabel(url: string, label: string, size = 1000): Promise<string> {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const data = qr.modules.data;

  // Quiet zone: 4 modules is the spec minimum and matters more than people expect —
  // scanners need the clear border to find the code at all.
  const QUIET = 4;
  const total = n + QUIET * 2;
  const unit = size / total;

  // One path for every dark module. A single <path> keeps the file small and renders
  // identically everywhere; per-module <rect>s would balloon it.
  let d = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!data[row * n + col]) continue;
      const x = (col + QUIET) * unit;
      const y = (row + QUIET) * unit;
      d += `M${x.toFixed(2)} ${y.toFixed(2)}h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`;
    }
  }

  const trimmed = label.trim() || "?";
  const text = trimmed.length > MAX_CHARS ? `${trimmed.slice(0, MAX_CHARS - 1)}…` : trimmed;
  const maxBoxW = size * BOX_W;
  const boxH = size * BOX_H;

  // Fit the text to the widest box we would ever allow: bounded by the height, and by an
  // estimate of its width (~0.6em per character for a bold sans face). Whichever is
  // smaller wins, so a long name shrinks instead of spilling over modules it must not touch.
  const byHeight = boxH * 0.62;
  const byWidth = (maxBoxW * 0.86) / Math.max(text.length * 0.6, 1);
  const fontSize = Math.max(Math.min(byHeight, byWidth), size * 0.018);

  // Then shrink the BOX to the text it actually holds. „12” needs nothing like the width
  // of „Terasă masa 14”, and every module not covered is error correction left over for
  // the scuffs and glare a sticker on a restaurant table will collect.
  const boxW = Math.min(maxBoxW, text.length * fontSize * 0.6 + fontSize * 0.9);
  const boxX = (size - boxW) / 2;
  const boxY = (size - boxH) / 2;
  const radius = boxH * 0.18;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <path d="${d}" fill="#000000"/>
  <rect x="${boxX.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="${radius.toFixed(2)}" fill="#ffffff"/>
  <text x="${(size / 2).toFixed(2)}" y="${(size / 2).toFixed(2)}" fill="#000000" font-size="${fontSize.toFixed(2)}" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" shape-rendering="auto">${esc(text)}</text>
</svg>`;
}
