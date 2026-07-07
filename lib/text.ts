/**
 * Shared text-normalization helpers.
 */

/**
 * Normalize a title for duplicate detection: lowercase, strip Romanian
 * diacritics, drop punctuation, collapse whitespace. Two titles that normalize
 * to the same string are treated as the same article (e.g. a morning vs evening
 * re-scrape of the same news).
 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritic marks
    .replace(/ș|ş/g, "s")
    .replace(/ț|ţ/g, "t")
    .replace(/ă|â/g, "a")
    .replace(/î/g, "i")
    .replace(/[^a-z0-9\s]/g, " ") // drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Menu-item allergens as display text. Allergens are stored as free text
 * ("gluten, ouă, lapte"), but older rows hold a JSON array from the previous
 * chip-based editor — normalize both to a plain comma-separated string.
 */
export function allergensToText(raw: string | null | undefined): string {
  if (!raw) return "";
  const t = raw.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.filter(Boolean).join(", ");
    } catch {
      /* fall through — treat as plain text */
    }
  }
  return t;
}
