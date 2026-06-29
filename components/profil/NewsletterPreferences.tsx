"use client";

import { useState } from "react";

interface Prefs {
  wantsNews: boolean;
  wantsEvents: boolean;
  wantsPlaces: boolean;
  wantsExperiences: boolean;
}

const OPTIONS: { key: keyof Prefs; label: string }[] = [
  { key: "wantsNews", label: "Știri" },
  { key: "wantsEvents", label: "Evenimente" },
  { key: "wantsPlaces", label: "Localuri noi" },
  { key: "wantsExperiences", label: "Experiențe noi" },
];

export default function NewsletterPreferences({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saved, setSaved] = useState<Prefs>(initial); // last persisted state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"saved" | "unsubscribed" | null>(null);

  const dirty = OPTIONS.some((o) => prefs[o.key] !== saved[o.key]);
  const anySelected = OPTIONS.some((o) => prefs[o.key]);

  function toggle(key: keyof Prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setDone(null);
    setError(null);
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/newsletter/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Eroare la salvare.");
        return;
      }
      setSaved(prefs);
      setDone(anySelected ? "saved" : "unsubscribed");
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <h2 className="font-semibold text-lg mb-1">Newsletter</h2>
      <p className="text-sm text-gray-500 mb-4">
        Alege ce vrei să primești pe email. Debifează tot ca să te dezabonezi complet.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {OPTIONS.map((o) => (
          <label
            key={o.key}
            className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={prefs[o.key]}
              onChange={() => toggle(o.key)}
              className="w-4 h-4 accent-[#c84b1e]"
            />
            {o.label}
          </label>
        ))}
      </div>

      {!anySelected && (
        <p className="text-xs text-amber-700 mb-3">
          Nu ai nicio categorie bifată — la salvare vei fi dezabonat de la newsletter.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={loading || !dirty}
          className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          {loading ? "Se salvează..." : "Salvează preferințele"}
        </button>
        {done === "saved" && (
          <span className="text-sm text-green-700 font-medium">✓ Preferințe salvate</span>
        )}
        {done === "unsubscribed" && (
          <span className="text-sm text-gray-600 font-medium">Te-ai dezabonat de la newsletter.</span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
