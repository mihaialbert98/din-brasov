"use client";

import { useRouter } from "next/navigation";

type Props = {
  categories: string[];
  active: string | undefined;
  basePath: string;
  paramName?: string;
  extraParams?: Record<string, string>;
  activeColor?: "green" | "terracotta";
};

export default function CategoryFilter({
  categories,
  active,
  basePath,
  paramName = "categorie",
  extraParams,
  activeColor = "green",
}: Props) {
  const router = useRouter();

  function buildHref(cat?: string) {
    const sp = new URLSearchParams(extraParams);
    if (cat) sp.set(paramName, cat);
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const activeClass =
    activeColor === "terracotta"
      ? "bg-[#c84b1e] text-white border-[#c84b1e]"
      : "bg-[#1a4731] text-white border-[#1a4731]";

  const inactiveClass =
    activeColor === "terracotta"
      ? "border-gray-300 text-gray-600 hover:bg-gray-50"
      : "border-gray-300 text-gray-700 hover:border-[#1a4731]";

  const focusClass =
    activeColor === "terracotta"
      ? "focus:border-[#c84b1e] focus:ring-[#c84b1e]"
      : "focus:border-[#1a4731] focus:ring-[#1a4731]";

  return (
    <>
      {/* Mobile: dropdown */}
      <div className="sm:hidden mb-6">
        <select
          value={active ?? ""}
          onChange={(e) => router.push(buildHref(e.target.value || undefined))}
          className={`w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 cursor-pointer ${focusClass}`}
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
