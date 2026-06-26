"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCES = [
  { key: "bizbrasov", label: "BizBrașov" },
  { key: "brasovnet", label: "Brașov.net" },
  { key: "mytex", label: "MyTex.ro" },
];

export default function ScrapePanel() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(SOURCES.map((s) => s.key)));
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleScrape() {
    setLoading(true);
    setError(null);
    setTotal(null);

    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Eroare la declanșarea scraper-ului.");
        return;
      }

      const added = data.total ?? 0;
      setTotal(added);
      if (added > 0) {
        // Reload the draft queue so the freshly scraped drafts appear. (All drafts
        // show the "Nou" badge until reviewed — no since-param needed.)
        router.refresh();
      }
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <p className="text-sm font-semibold text-gray-700 mb-3">Surse de scraping</p>
      <div className="flex flex-wrap gap-3 mb-4">
        {SOURCES.map((s) => (
          <label key={s.key} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected.has(s.key)}
              onChange={() => toggle(s.key)}
              className="w-4 h-4 accent-[#c84b1e]"
            />
            <span className="text-sm text-gray-700">{s.label}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleScrape}
          disabled={loading || selected.size === 0}
          className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          {loading ? "Se scrapează..." : "Scrape acum"}
        </button>

        {loading && (
          <span className="text-sm text-gray-500 flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-[#c84b1e] border-t-transparent rounded-full animate-spin" />
            Poate dura până la un minut...
          </span>
        )}

        {!loading && total !== null && (
          total > 0 ? (
            <span className="text-sm text-green-700 font-medium">
              ✓ {total} {total === 1 ? "știre nouă în coada de revizuire" : "știri noi în coada de revizuire"}.
            </span>
          ) : (
            <span className="text-sm text-gray-500">Nu există știri noi față de ultima scraping.</span>
          )
        )}

        {!loading && error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
