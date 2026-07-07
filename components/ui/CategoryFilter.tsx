"use client";

import { useRouter } from "next/navigation";

type Props = {
  categories: string[];
  active: string | undefined;
  basePath: string;
  paramName?: string;
  extraParams?: Record<string, string>;
  /**
   * Kept for API compatibility with existing callers. The site now has ONE brand
   * accent, so the active pill is always terracotta regardless of this value.
   */
  activeColor?: "green" | "terracotta";
};

export default function CategoryFilter({
  categories,
  active,
  basePath,
  paramName = "categorie",
  extraParams,
}: Props) {
  const router = useRouter();

  function buildHref(cat?: string) {
    const sp = new URLSearchParams(extraParams);
    if (cat) sp.set(paramName, cat);
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const activeClass = "bg-accent text-white border-accent";
  const inactiveClass =
    "border-hairline text-muted hover:border-accent/40 hover:text-ink bg-surface";

  return (
    <>
      {/* Mobile: dropdown */}
      <div className="sm:hidden mb-6">
        <select
          value={active ?? ""}
          onChange={(e) => router.push(buildHref(e.target.value || undefined))}
          className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm text-ink bg-surface focus:outline-none focus:ring-1 focus:border-accent focus:ring-accent cursor-pointer"
          aria-label="Filtrează după categorie"
        >
          <option value="">Toate categoriile</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: pills */}
      <div className="hidden sm:flex gap-2 mb-8 flex-wrap">
        <a
          href={buildHref()}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
            !active ? activeClass : inactiveClass
          }`}
        >
          Toate
        </a>
        {categories.map((cat) => (
          <a
            key={cat}
            href={buildHref(cat)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
              active === cat ? activeClass : inactiveClass
            }`}
          >
            {cat}
          </a>
        ))}
      </div>
    </>
  );
}
