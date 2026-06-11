"use client";

import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  value: string;
  basePath: string;
  extraParams?: Record<string, string>;
  sortParam?: string;
  defaultSort?: string;
};

export default function SortSelect({
  options,
  value,
  basePath,
  extraParams,
  sortParam = "sortare",
  defaultSort = "newest",
}: Props) {
  const router = useRouter();

  function buildHref(sort: string) {
    const sp = new URLSearchParams(extraParams);
    if (sort !== defaultSort) sp.set(sortParam, sort);
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <select
      value={value}
      onChange={(e) => router.push(buildHref(e.target.value))}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-[#1a4731] focus:ring-1 focus:ring-[#1a4731] cursor-pointer"
      aria-label="Sortare anunțuri"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
