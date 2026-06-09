"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const SOURCES = [
  { key: "bizbrasov", label: "BizBrașov" },
  { key: "brasovnet", label: "Brașov.net" },
  { key: "mytex", label: "MyTex.ro" },
];

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 60000;
const POLL_STABLE_AFTER = 20000; // if count unchanged for this long, scraper is done with 0 results

export default function ScrapePanel() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(SOURCES.map((s) => s.key)));
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [newCount, setNewCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baselineRef = useRef<number | null>(null);
  const sinceRef = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStart = useRef<number>(0);
  const lastChangeRef = useRef<number>(0);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setPolling(false);
  }

  useEffect(() => () => stopPolling(), []);

  async function getDraftCount(): Promise<number> {
    const res = await fetch("/api/news/drafts");
    const data = await res.json();
    return data.count ?? 0;
  }

  async function handleScrape() {
    setLoading(true);
    setError(null);
    setNewCount(null);

    const baseline = await getDraftCount().catch(() => 0);
    baselineRef.current = baseline;

    const res = await fetch("/api/admin/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources: Array.from(selected) }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la declanșarea scraper-ului.");
      return;
    }

    const data = await res.json().catch(() => ({}));
    // store the scrape start time to mark new cards server-side
    sinceRef.current = data.startedAt
      ? new Date(data.startedAt).toISOString()
      : new Date().toISOString();

    setPolling(true);
    const now = Date.now();
    pollStart.current = now;
    lastChangeRef.current = now;

    pollTimer.current = setInterval(async () => {
      const elapsed = Date.now() - pollStart.current;
      const stableFor = Date.now() - lastChangeRef.current;

      if (elapsed > POLL_TIMEOUT) {
        stopPolling();
        setError("Scraper-ul durează mai mult decât de obicei. Reîncarcă pagina manual.");
        return;
      }

      const current = await getDraftCount().catch(() => null);
      if (current === null) return;

      const added = current - (baselineRef.current ?? 0);
      if (added > 0) {
        stopPolling();
        setNewCount(added);
        router.push(`/admin/stiri?since=${encodeURIComponent(sinceRef.current!)}`);
      } else if (stableFor >= POLL_STABLE_AFTER) {
        stopPolling();
        setNewCount(0);
      } else {
        lastChangeRef.current = Date.now();
      }
    }, POLL_INTERVAL);
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

      {newCount !== null ? (
        newCount === 0 ? (
          <p className="text-sm text-gray-500">Nu există știri noi față de ultima scraping.</p>
        ) : (
          <p className="text-sm text-green-700 font-medium">
            ✓ {newCount} {newCount === 1 ? "știre nouă a apărut" : "știri noi au apărut"} în coada de revizuire.
          </p>
        )
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : polling ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-[#c84b1e] border-t-transparent rounded-full animate-spin" />
          Se caută știri noi...
        </p>
      ) : (
        <button
          onClick={handleScrape}
          disabled={loading || selected.size === 0}
          className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          {loading ? "Se pornește..." : "Scrape acum"}
        </button>
      )}
    </div>
  );
}
