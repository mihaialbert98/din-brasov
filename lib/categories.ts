/**
 * Single source of truth for category badge styling across the public site.
 *
 * Previously every section invented its own badge colors (cream+terracotta,
 * green-100, amber-100, a 6-color rainbow map duplicated in two files). That
 * scatter is a big part of why the site read as incoherent. Here we use ONE
 * restrained, warm-neutral chip by default, with a small set of low-saturation
 * accent tints reserved for genuinely distinct top-level categories. The goal is
 * a system that looks chosen, not a rainbow.
 */

/**
 * The "Cultură" area is not a separate data section — it's the events subsystem
 * surfaced as its own destination. These are the single source of truth for the
 * category string (must match the admin event dropdown value, incl. diacritics)
 * and the canonical URL used by the navbar, hero, and homepage teaser.
 */
export const CULTURE_CATEGORY = "Cultură";
export const CULTURE_HREF = `/evenimente?categorie=${encodeURIComponent(CULTURE_CATEGORY)}`;

/** Default chip: warm neutral, works for any label. */
export const DEFAULT_CATEGORY_TINT = "bg-cream/50 text-ink/70";

/**
 * Optional low-saturation tints for specific, recurring category names. Only a
 * few are colored on purpose — everything else falls back to the neutral chip.
 * Tints stay muted (…-50/…-700) so they harmonize with the terracotta brand
 * rather than competing with it.
 */
const CATEGORY_TINTS: Record<string, string> = {
  // Experiențe
  "Aventură": "bg-orange-50 text-orange-800",
  "Sport": "bg-sky/15 text-sky-dark",
  "Cultură": "bg-stone-100 text-stone-700",
  "Gastronomie": "bg-amber-50 text-amber-800",
  "Natură": "bg-emerald-50 text-emerald-800",
  // Știri
  "Actualitate": "bg-accent-soft text-accent-hover",
  "Business": "bg-stone-100 text-stone-700",
  "Sănătate": "bg-emerald-50 text-emerald-800",
  // Evenimente (the remaining event categories, for a consistent chip system)
  "Muzică": "bg-violet-50 text-violet-800",
  "Food": "bg-amber-50 text-amber-800",
  "Educație": "bg-sky/15 text-sky-dark",
};

/** Tailwind classes for a category chip. Falls back to the neutral tint. */
export function categoryTint(category?: string | null): string {
  if (!category) return DEFAULT_CATEGORY_TINT;
  return CATEGORY_TINTS[category] ?? DEFAULT_CATEGORY_TINT;
}
