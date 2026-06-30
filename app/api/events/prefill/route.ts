/**
 * Best-effort event prefill from a pasted link (Facebook event, Eventbrite, venue
 * page, …). Admin/moderator only. Fetches the URL server-side and extracts what it
 * can from schema.org Event JSON-LD (richest: dates, location, price) and Open
 * Graph / meta tags (title, description, image) as a fallback.
 *
 * This is a CONVENIENCE: it never blocks manual entry. Anything it can't read comes
 * back empty and the admin fills it in. Facebook in particular often only exposes
 * og:title / og:description / og:image to server-side fetches (no reliable date).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

export const maxDuration = 20;

const schema = z.object({ url: z.string().url() });

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000; // 2 MB cap on the HTML we'll read

// Facebook (and many sites) only serve Open Graph tags to recognised crawlers — a
// normal browser UA gets a 400/login wall on FB event pages. Presenting the
// standard OG crawler UA is exactly what og:* tags are published for.
const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

export interface PrefillResult {
  title?: string;
  description?: string;
  startsAt?: string; // datetime-local: YYYY-MM-DDTHH:mm
  endsAt?: string;
  locationName?: string;
  address?: string;
  imageUrl?: string;
  isFree?: boolean;
  price?: string;
  externalUrl: string;
  // True when the description is Facebook's auto-generated summary (e.g. "Eveniment
  // găzduit de … cu N persoane interesate") rather than the organizer's real text.
  // FB never exposes the real description to crawlers, so the admin should replace it.
  descriptionIsFacebookSummary?: boolean;
}

/** Block private / loopback / link-local hosts — we're fetching a user-supplied URL (SSRF guard). */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  // IPv6 loopback / unspecified
  if (h === "::1" || h === "[::1]" || h === "::" ) return true;
  // IPv4 literal ranges that must never be reachable from a server fetch
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true; // loopback / private / "this host"
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
  }
  return false;
}

/** Decode common HTML entities found in meta-tag content. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Extract a meta tag's content by property (og:*) or name attribute. */
function metaContent(html: string, key: string): string | undefined {
  // property="og:title" content="..."  OR  content="..." property="og:title"
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

/** Convert any parseable date string to the datetime-local format the form expects. */
function toLocalInput(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  // Render in local components (matches a <input type="datetime-local"> value)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Find the first schema.org Event object among all JSON-LD blocks. */
function findEventJsonLd(html: string): Record<string, any> | undefined {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    // JSON-LD may be a single object, an array, or have an @graph array.
    const candidates: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.["@graph"])
        ? parsed["@graph"]
        : [parsed];
    for (const c of candidates) {
      const t = c?.["@type"];
      const types = Array.isArray(t) ? t : [t];
      if (types.some((x) => typeof x === "string" && x.toLowerCase().includes("event"))) {
        return c;
      }
    }
  }
  return undefined;
}

function pickString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function extractFromJsonLd(ev: Record<string, any>): Partial<PrefillResult> {
  const out: Partial<PrefillResult> = {};
  out.title = pickString(ev.name);
  out.description = pickString(ev.description);
  out.startsAt = toLocalInput(ev.startDate);
  out.endsAt = toLocalInput(ev.endDate);

  // Location can be a string, an object, or an array of objects.
  const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
  if (typeof loc === "string") {
    out.locationName = pickString(loc);
  } else if (loc && typeof loc === "object") {
    out.locationName = pickString(loc.name);
    const addr = loc.address;
    if (typeof addr === "string") out.address = pickString(addr);
    else if (addr && typeof addr === "object") {
      out.address = [addr.streetAddress, addr.addressLocality, addr.postalCode]
        .map(pickString)
        .filter(Boolean)
        .join(", ") || undefined;
    }
  }

  // Image can be a string or array.
  const img = Array.isArray(ev.image) ? ev.image[0] : ev.image;
  out.imageUrl = pickString(typeof img === "object" ? img?.url : img);

  // Offers → price / free.
  const offer = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
  if (offer && typeof offer === "object") {
    const price = offer.price ?? offer.lowPrice;
    if (price != null && Number(price) > 0) {
      out.isFree = false;
      out.price = String(price);
    } else if (price != null && Number(price) === 0) {
      out.isFree = true;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Link invalid." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(parsed.data.url);
  } catch {
    return NextResponse.json({ error: "Link invalid." }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Folosește un link http(s)." }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "Link nepermis." }, { status: 400 });
  }

  const result: PrefillResult = { externalUrl: target.toString() };

  let html = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(target.toString(), {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const reader = res.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let total = 0;
        // Read up to MAX_BYTES, then stop — the <head> metadata is near the top.
        while (total < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            total += value.length;
          }
        }
        reader.cancel().catch(() => {});
        html = new TextDecoder("utf-8").decode(
          chunks.reduce<Uint8Array>((acc, c) => {
            const merged = new Uint8Array(acc.length + c.length);
            merged.set(acc);
            merged.set(c, acc.length);
            return merged;
          }, new Uint8Array())
        );
      } else {
        html = await res.text();
      }
    }
  } catch {
    // Unreachable / timed out / blocked — return just the URL so the admin can fill manually.
    return NextResponse.json({
      ...result,
      warning: "N-am putut citi linkul. Completează manual câmpurile.",
    });
  }

  const isFacebook = /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/i.test(target.hostname);

  if (html) {
    // JSON-LD first (richest), then OG/meta to fill the gaps.
    const ev = findEventJsonLd(html);
    if (ev) Object.assign(result, extractFromJsonLd(ev));

    result.title ??= metaContent(html, "og:title");

    // Track whether the description we end up with came from OG (vs real JSON-LD
    // text). On Facebook the og:description is a generated summary, never the
    // organizer's actual text — flag it so the admin replaces it.
    const descFromJsonLd = !!result.description;
    result.description ??= metaContent(html, "og:description") ?? metaContent(html, "description");
    if (isFacebook && result.description && !descFromJsonLd) {
      result.descriptionIsFacebookSummary = true;
    }

    result.imageUrl ??= metaContent(html, "og:image");
  }

  // Trim a description to the column-friendly length; the form allows editing.
  if (result.description && result.description.length > 2000) {
    result.description = result.description.slice(0, 2000);
  }

  const gotAnything = Boolean(
    result.title || result.description || result.startsAt || result.imageUrl
  );
  return NextResponse.json(
    gotAnything
      ? result
      : { ...result, warning: "N-am găsit date în acest link. Completează manual." }
  );
}
