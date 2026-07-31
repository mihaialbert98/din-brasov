/**
 * Shared query parsing for the staff capacity-preview endpoints (owner route +
 * staff-token route), so both validate identically.
 */
export type CapacityQuery = {
  date: string;
  time: string;
  partySize: number;
  area?: "inside" | "outside";
  /** Editing an existing booking: don't count it against itself. */
  exclude?: string;
};

export function parseCapacityQuery(url: string): CapacityQuery | null {
  const p = new URL(url).searchParams;
  const date = p.get("date") ?? "";
  const time = p.get("time") ?? "";
  const partySize = Number(p.get("partySize") ?? "0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 200) return null;

  const areaParam = p.get("area");
  return {
    date,
    time,
    partySize,
    area: areaParam === "inside" || areaParam === "outside" ? areaParam : undefined,
    exclude: p.get("exclude") || undefined,
  };
}
