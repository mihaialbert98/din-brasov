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
