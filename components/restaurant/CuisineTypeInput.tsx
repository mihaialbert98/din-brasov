"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { CUISINE_SUGGESTIONS } from "@/lib/restaurant-cuisines";

/** Owner sets the restaurant's type/cuisine — pick a suggestion or type freely. */
export default function CuisineTypeInput({
  restaurantId,
  initialValue,
}: {
  restaurantId: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/restaurants/${restaurantId}/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuisineType: value.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Eroare.");
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Tip local</h2>
      <p className="text-sm text-gray-500 mb-3">
        Ce fel de local ești? Apare ca etichetă pe cardul din Localuri. Alege o sugestie sau scrie liber.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {CUISINE_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              value === s ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex: Italiană, Fast-food…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]"
        />
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 text-sm bg-[#1a1a1a] text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-60"
        >
          {saved ? <><Check className="w-4 h-4" aria-hidden /> Salvat</> : saving ? "Se salvează…" : "Salvează"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
