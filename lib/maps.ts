/**
 * Build a universal "open in maps" URL.
 *
 * Uses the Google Maps Search API URL, which behaves well everywhere:
 *  - Android → opens the Google Maps app
 *  - iOS → opens Google Maps if installed, otherwise the browser (which offers Apple Maps)
 *  - desktop → google.com/maps in a new tab
 *
 * Uses the most specific single locator, never a name+address combination (which
 * can make Google fuzzy-match a business name and ignore the precise street):
 *   1. exact coordinates (a pin on the spot),
 *   2. the address (precise, predictable),
 *   3. the venue name — only as a fallback when there's no address (e.g. an event
 *      that just says "Piața Sfatului").
 * Brașov is appended when the chosen text doesn't already name the city, so a bare
 * street doesn't resolve elsewhere.
 *
 * Returns null when there's nothing usable to search for.
 */
export function mapsUrl(opts: {
  address?: string | null;
  /** Venue/place name — used only when no address is available. */
  name?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}): string | null {
  const { address, name, latitude, longitude } = opts;

  // Exact coordinates win — they drop a pin on the precise spot.
  if (latitude && longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }

  // Address alone is the precise, predictable choice; the name is only a fallback.
  let query = (address?.trim() || name?.trim() || "");
  if (!query) return null;

  // Keep searches in the right city when the text doesn't already name it.
  if (!/bra[sș]ov/i.test(query)) query += ", Brașov";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
