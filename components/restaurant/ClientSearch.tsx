"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Single search box for the restaurant Clienți list — matches on name OR phone.
 * Navigates to `?q=…` (resetting pagination). Server does the actual filtering.
 */
export default function ClientSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);

  function go(q: string) {
    const trimmed = q.trim();
    router.push(trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname);
  }

  function reset() {
    setValue("");
    router.push(pathname);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
      className="flex flex-wrap items-center gap-2"
      role="search"
    >
      <div className="relative flex-1 min-w-[12rem]">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            // Emptying the field (e.g. backspacing it all) restores the full list.
            if (next === "" && initialQuery) router.push(pathname);
          }}
          placeholder="Caută după nume sau telefon…"
          aria-label="Caută clienți după nume sau telefon"
          className="w-full h-11 pl-10 pr-9 rounded-xl border border-gray-200 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        {value && (
          <button
            type="button"
            onClick={reset}
            aria-label="Golește câmpul"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      <button
        type="submit"
        className="h-11 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
      >
        Caută
      </button>

      {initialQuery && (
        <button
          type="button"
          onClick={reset}
          className="h-11 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Resetare căutare
        </button>
      )}
    </form>
  );
}
