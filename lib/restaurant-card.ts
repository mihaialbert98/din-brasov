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
export const TEMPLATE_W = 1540;
export const TEMPLATE_H = 980;

// QR target box (inside the dashed frame). Square; keep some inner padding.
const QR = { x: 1180, y: 430, size: 300 };

// Name band: centered horizontally within this box, vertically centered.
const NAME = { x: 470, y: 520, w: 640, h: 90, color: "#1a1a1a" };

/** SVG text block that auto-fits the name width (serif, brand dark). */
function nameSvg(name: string): Buffer {
  const safe = name
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // Rough auto-fit: shrink font as the name grows so long names still fit NAME.w.
  const fontSize = Math.max(28, Math.min(64, Math.floor((NAME.w * 1.7) / Math.max(6, safe.length))));
  return Buffer.from(`
    <svg width="${NAME.w}" height="${NAME.h}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .n { font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
             fill: ${NAME.color}; }
      </style>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
            class="n" font-size="${fontSize}">${safe}</text>
    </svg>`);
}

export interface CardOptions {
  restaurantName: string;
  menuUrl: string;
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
      <text x="${QR.x + QR.size / 2}" y="${QR.y - 20}" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="#c84b1e">SCANEAZĂ PENTRU MENIU</text>
      <rect x="${QR.x - 24}" y="${QR.y - 24}" width="${QR.size + 48}" height="${QR.size + 48}" rx="16" fill="none" stroke="#c84b1e" stroke-width="3" stroke-dasharray="10 8"/>
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

  // QR as a PNG buffer sized to the placeholder box.
  const qrPng = await QRCode.toBuffer(opts.menuUrl, {
    type: "png",
    width: QR.size,
    margin: 0,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });

  const composites: { input: Buffer; left: number; top: number }[] = [
    { input: qrPng, left: QR.x, top: QR.y },
  ];
  if (overlayName) {
    composites.push({ input: nameSvg(opts.restaurantName), left: NAME.x, top: NAME.y });
  }

  return sharp(base).composite(composites).png().toBuffer();
}
