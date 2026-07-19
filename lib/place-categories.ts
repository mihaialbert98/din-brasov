/**
 * Canonical Localuri categories — food & drink venue types. Single source of truth
 * for the admin add/edit forms, the public /localuri filter, and API validation.
 * "Altele" is the catch-all (also where legacy/non-food categories are migrated).
 */
export const PLACE_CATEGORIES = [
  "Restaurant",
  "Bar",
  "Pub",
  "Cafenea",
  "Cofetărie",
  "Fast-food",
  "Altele",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** True when a value is one of the canonical categories. */
export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === "string" && (PLACE_CATEGORIES as readonly string[]).includes(value);
}
