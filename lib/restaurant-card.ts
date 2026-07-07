/**
 * Business-card compositor. Overlays a table's QR code (and, optionally, the
 * restaurant name) onto the branded Din Brașov card template, producing a final
 * PNG per table — pixel-perfect and printable.
 *
 * The template lives at public/card-template.png. Its QR + name regions are fixed
 * pixel boxes below (TEMPLATE_*). If the design changes, retune these constants.
 *
 * A restaurant may opt to use a CUSTOM template (its own uploaded image) and/or
 * skip the name overlay (when the name is already baked into the design).
 */
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import QRCode from "qrcode";

// ─── Template geometry (measured against public/card-template.png) ────────────
// Base template is 1540×980. The QR placeholder is the dashed box on the right;
// the name goes in the "Numele Restaurantului" band. Tune if the design changes.
const TEMPLATE_PATH = path.join(process.cwd(), "public", "card-template.png");
// Real template geometry (measured from public/card-template.png @ 1561×1008).
export const TEMPLATE_W = 1561;
export const TEMPLATE_H = 1008;

// The template ships with baked-in placeholder text ("Numele Restaurantului",
// "Loc pentru codul QR"), so each overlay first paints a cover rect in the card's
// cream background color, then draws the real content on top.
const BG = "#fdf4ea"; // sampled card background

// QR: centered inside the dashed frame (frame ≈ x1192–1527, y428–816).
const QR = { cx: 1359, cy: 622, size: 300 };

// Name band: covers the placeholder text (bbox x552–1143, y334–387), centered.
const NAME = { cx: 847, cy: 360, w: 640, h: 86, color: "#2a2320" };

// Table label pill, top-left corner of the card.
const LABEL = { x: 44, y: 40, w: 210, h: 56 };

const escSvg = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Restaurant name (serif, brand dark), on a cover rect that hides the placeholder. */
function nameSvg(name: string): Buffer {
  const safe = escSvg(name);
  // Auto-fit: shrink the font for long names so they stay within NAME.w.
  const fontSize = Math.max(30, Math.min(60, Math.floor((NAME.w * 1.6) / Math.max(6, safe.length))));
  return Buffer.from(`
    <svg width="${NAME.w}" height="${NAME.h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${BG}"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
            font-family="Georgia, 'Times New Roman', serif" font-weight="700"
            fill="${NAME.color}" font-size="${fontSize}">${safe}</text>
    </svg>`);
}

/** QR on a white cover rect (hides "Loc pentru codul QR" and gives a scan-safe quiet zone). */
function qrPlateSvg(size: number): Buffer {
  const pad = 18;
  const outer = size + pad * 2;
  return Buffer.from(`
    <svg width="${outer}" height="${outer}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="18" fill="#ffffff"/>
    </svg>`);
}

/** Table label as a brand-colored rounded pill (corner of the card). */
function labelSvg(label: string): Buffer {
  const safe = escSvg(label);
  return Buffer.from(`
    <svg width="${LABEL.w}" height="${LABEL.h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="28" fill="#c84b1e"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
            font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-weight="700"
            font-size="28" fill="#ffffff">${safe}</text>
    </svg>`);
}

export interface CardOptions {
  restaurantName: string;
  menuUrl: string;
  /** Table label drawn as a corner pill (e.g. "Masa 5"). */
  tableLabel?: string;
  /** Absolute path or Buffer of a custom template (else the default brand card). */
  template?: Buffer;
  /** Skip drawing the name (custom templates may already include it). */
  overlayName?: boolean;
}

/**
 * Composite the final card PNG. Returns a Buffer (PNG). QR is generated from
 * menuUrl in brand-dark on white.
 */
/** Fallback template (used until public/card-template.png is added): plain brand card. */
function fallbackTemplate(): Buffer {
  return Buffer.from(`
    <svg width="${TEMPLATE_W}" height="${TEMPLATE_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f4f1ec"/>
      <rect x="20" y="20" width="${TEMPLATE_W - 40}" height="${TEMPLATE_H - 40}"
            rx="28" fill="none" stroke="#c84b1e" stroke-width="4"/>
      <text x="60" y="120" font-family="Georgia,serif" font-size="52" font-weight="700" fill="#1a1a1a">Din <tspan fill="#c84b1e">Brașov</tspan></text>
      <text x="60" y="170" font-family="sans-serif" font-size="22" letter-spacing="3" fill="#6b7280">SMART MENU PENTRU RESTAURANTE</text>
      <text x="${QR.cx}" y="${QR.cy - QR.size / 2 - 24}" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="#c84b1e">SCANEAZĂ PENTRU MENIU</text>
      <rect x="${QR.cx - QR.size / 2 - 24}" y="${QR.cy - QR.size / 2 - 24}" width="${QR.size + 48}" height="${QR.size + 48}" rx="16" fill="none" stroke="#c84b1e" stroke-width="3" stroke-dasharray="10 8"/>
    </svg>`);
}

export async function renderCard(opts: CardOptions): Promise<Buffer> {
  const overlayName = opts.overlayName ?? true;

  let base: Buffer;
  if (opts.template) {
    base = opts.template;
  } else {
    base = await readFile(TEMPLATE_PATH).catch(() => sharp(fallbackTemplate()).png().toBuffer());
  }

  // QR as a PNG buffer, brand-dark on white.
  const qrPng = await QRCode.toBuffer(opts.menuUrl, {
    type: "png",
    width: QR.size,
    margin: 0,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });

  const platePad = 18;
  const plateSize = QR.size + platePad * 2;

  // Everything is positioned by CENTER for easy tuning → convert to top-left here.
  const composites: { input: Buffer; left: number; top: number }[] = [
    // White plate (covers "Loc pentru codul QR" + quiet zone), then the QR on top.
    { input: qrPlateSvg(QR.size), left: Math.round(QR.cx - plateSize / 2), top: Math.round(QR.cy - plateSize / 2) },
    { input: qrPng, left: Math.round(QR.cx - QR.size / 2), top: Math.round(QR.cy - QR.size / 2) },
  ];
  if (overlayName) {
    composites.push({
      input: nameSvg(opts.restaurantName),
      left: Math.round(NAME.cx - NAME.w / 2),
      top: Math.round(NAME.cy - NAME.h / 2),
    });
  }
  if (opts.tableLabel) {
    composites.push({ input: labelSvg(opts.tableLabel), left: LABEL.x, top: LABEL.y });
  }

  return sharp(base).composite(composites).png().toBuffer();
}
