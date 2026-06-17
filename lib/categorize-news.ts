/**
 * Heuristic news categorizer — scraped items arrive without a category, so we
 * guess one from the title/excerpt keywords (and source name as a weak hint).
 * Moderators can override the guess in the review form before publishing.
 *
 * Categories must match the filter buttons on /stiri exactly (diacritics included):
 *   "Actualitate" | "Sport" | "Cultură" | "Business" | "Sănătate" | "Altele"
 */
export const NEWS_CATEGORIES = [
  "Actualitate",
  "Sport",
  "Cultură",
  "Business",
  "Sănătate",
  "Altele",
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

const DEFAULT_CATEGORY: NewsCategory = "Actualitate";

// Keyword → category. Lowercased, diacritics-insensitive matching (see normalize).
// Order matters only for readability; first category with a hit wins by the
// scan order below.
// Keyword stems matched on WORD BOUNDARIES (a stem matches a whole word or a
// word that starts with it — e.g. "fotbal" matches "fotbalul"). Short, ambiguous
// stems that collide inside unrelated words (gol→Bolojan, liga→obligație,
// arta→artă-in-anything, ski→schimbare) are deliberately excluded. We require a
// minimum score so a single weak hit can't override "Actualitate".
const KEYWORDS: Record<Exclude<NewsCategory, "Actualitate" | "Altele">, string[]> = {
  Sport: [
    "fotbal", "baschet", "handbal", "rugby", "tenis", "hochei", "meci",
    "meciul", "campionat", "campioana", "campion", "antrenor", "jucator",
    "stadion", "olimpiada", "medalie", "sportiv", "sportul", "turneu",
    "atletism", "ciclism", "maraton", "corona brasov", "fc brasov",
  ],
  Cultură: [
    "teatru", "festival", "concert", "expozitie", "muzeu", "spectacol",
    "spectacolul", "pictura", "artist", "muzica", "opera brasov", "balet",
    "biblioteca", "patrimoniu", "folclor", "vernisaj", "scriitor", "regizor",
    "filarmonica", "cultural", "culturala",
  ],
  Business: [
    "afacere", "afacerea", "afaceri", "investitie", "investitia", "investitii",
    "companie", "companii", "antreprenor", "economie", "economic", "comert",
    "angajari", "salariu", "salariul", "finantare", "startup", "fabrica",
    "productie", "profit", "bursa", "industrie", "imobiliar",
  ],
  Sănătate: [
    "spital", "spitalul", "medic", "medicii", "doctor", "boala", "vaccin",
    "pacient", "pacienti", "tratament", "clinica", "ambulanta", "epidemie",
    "pandemie", "gripa", "covid", "farmacie", "chirurgical", "chirurgicala",
  ],
};

// A single keyword hit is weak; require at least this many to override the
// default. Tuned so unrelated political/event news stays "Actualitate".
const MIN_SCORE = 1;

/** Lowercase + strip Romanian diacritics for robust keyword matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks
    .replace(/ș|ş/g, "s")
    .replace(/ț|ţ/g, "t")
    .replace(/ă|â/g, "a")
    .replace(/î/g, "i");
}

/** True if `stem` appears as a whole word (or word-prefix) in `haystack`. */
function hasWord(haystack: string, stem: string): boolean {
  // \b doesn't treat normalized diacritics specially; \w covers a-z0-9 after
  // normalize(). Match at a word boundary so "gol" won't hit "Bolojan".
  const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  return re.test(haystack);
}

/**
 * Returns a best-guess category. Never returns null — defaults to "Actualitate"
 * so a published item is always selectable by some filter button.
 */
export function guessNewsCategory(
  title: string | null | undefined,
  excerpt?: string | null,
  sourceName?: string | null
): NewsCategory {
  const haystack = normalize(`${title ?? ""} ${excerpt ?? ""} ${sourceName ?? ""}`);

  // Score each category by whole-word keyword hits; highest wins. Ties broken by
  // KEYWORDS declaration order (Sport, Cultură, Business, Sănătate).
  let best: NewsCategory = DEFAULT_CATEGORY;
  let bestScore = 0;
  for (const [category, words] of Object.entries(KEYWORDS) as [
    Exclude<NewsCategory, "Actualitate" | "Altele">,
    string[],
  ][]) {
    let score = 0;
    for (const w of words) {
      if (hasWord(haystack, normalize(w))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }

  return bestScore >= MIN_SCORE ? best : DEFAULT_CATEGORY;
}
