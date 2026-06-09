const DIACRITICS: Record<string, string> = {
  ă: "a", â: "a", î: "i", ș: "s", ț: "t",
  Ă: "a", Â: "a", Î: "i", Ș: "s", Ț: "t",
  ş: "s", ţ: "t", Ş: "s", Ţ: "t", // legacy cedilla variants
};

export function slugify(text: string, suffix?: string): string {
  const base = text
    .split("")
    .map((c) => DIACRITICS[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return suffix ? `${base}-${suffix}` : base;
}

export function slugifyWithDate(text: string, date?: Date): string {
  const dateStr = (date ?? new Date()).toISOString().slice(0, 10);
  return slugify(text, dateStr);
}
