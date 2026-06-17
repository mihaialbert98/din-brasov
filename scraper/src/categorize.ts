/**
 * Heuristic news categorizer for scraped items (self-contained copy — the
 * scraper is a separate package and can't import from the Next app's lib/).
 * Keep in sync with ../../lib/categorize-news.ts.
 *
 * Categories must match the /stiri filter buttons exactly (diacritics included):
 *   "Actualitate" | "Sport" | "Cultură" | "Business" | "Sănătate" | "Altele"
 */
const DEFAULT_CATEGORY = "Actualitate";

// Stems matched on word boundaries; ambiguous short stems excluded (see lib copy).
const KEYWORDS: Record<string, string[]> = {
  Sport: [
    "fotbal", "baschet", "handbal", "rugby", "tenis", "hochei", "meci",
    "meciul", "campionat", "campioana", "campion", "antrenor", "jucator",
    "stadion", "olimpiada", "medalie", "sportiv", "sportul", "turneu",
    "atletism", "ciclism", "maraton", "corona brasov", "fc brasov",
  ],
  "Cultură": [
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
  "Sănătate": [
    "spital", "spitalul", "medic", "medicii", "doctor", "boala", "vaccin",
    "pacient", "pacienti", "tratament", "clinica", "ambulanta", "epidemie",
    "pandemie", "gripa", "covid", "farmacie", "chirurgical", "chirurgicala",
  ],
};

const MIN_SCORE = 1;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ș|ş/g, "s")
    .replace(/ț|ţ/g, "t")
    .replace(/ă|â/g, "a")
    .replace(/î/g, "i");
}

function hasWord(haystack: string, stem: string): boolean {
  const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  return re.test(haystack);
}

export function guessNewsCategory(
  title?: string | null,
  excerpt?: string | null,
  sourceName?: string | null
): string {
  const haystack = normalize(`${title ?? ""} ${excerpt ?? ""} ${sourceName ?? ""}`);
  let best = DEFAULT_CATEGORY;
  let bestScore = 0;
  for (const [category, words] of Object.entries(KEYWORDS)) {
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
