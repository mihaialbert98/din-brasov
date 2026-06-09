"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ImageField from "@/components/admin/ImageField";

const CATEGORIES = ["Cultură", "Sport", "Muzică", "Food", "Business", "Educație", "Altele"];

export default function NouEvenimentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isFree, setIsFree] = useState(true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        startsAt: form.get("startsAt"),
        endsAt: form.get("endsAt") || undefined,
        locationName: form.get("locationName") || undefined,
        address: form.get("address") || undefined,
        category: form.get("category") || undefined,
        externalUrl: form.get("externalUrl") || undefined,
        isFree,
        price: isFree ? undefined : (form.get("price") as string) || undefined,
        currency: "RON",
        imageUrl: imageUrl || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    router.push("/admin/evenimente");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/evenimente" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Adaugă eveniment</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="font-medium text-gray-700">Titlu *</label>
          <input
            id="title" name="title" type="text" required maxLength={200}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere *</label>
          <textarea
            id="description" name="description" required rows={4}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="startsAt" className="font-medium text-gray-700">Data început *</label>
            <input
              id="startsAt" name="startsAt" type="datetime-local" required
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="endsAt" className="font-medium text-gray-700">Data sfârșit</label>
            <input
              id="endsAt" name="endsAt" type="datetime-local"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="locationName" className="font-medium text-gray-700">Locație</label>
            <input
              id="locationName" name="locationName" type="text" maxLength={200}
              placeholder="ex: Piața Sfatului"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="font-medium text-gray-700">Categorie</label>
            <select
              id="category" name="category" defaultValue=""
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            >
              <option value="">Fără categorie</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="address" className="font-medium text-gray-700">Adresă</label>
          <input
            id="address" name="address" type="text" maxLength={300}
            placeholder="ex: Piața Sfatului 1, Brașov"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="font-medium text-gray-700">Intrare</label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="w-5 h-5 accent-[#c84b1e]"
            />
            <span className="text-gray-700">Intrare liberă</span>
          </label>
          {!isFree && (
            <div className="flex items-center gap-3">
              <input
                name="price" type="number" min="0" step="0.01" placeholder="Preț"
                className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] w-40"
              />
              <span className="text-gray-500 font-medium">RON</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="externalUrl" className="font-medium text-gray-700">Link extern</label>
          <input
            id="externalUrl" name="externalUrl" type="url"
            placeholder="https://facebook.com/events/... sau eventbrite.ro/..."
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <ImageField
          endpoint="eventImage"
          value={imageUrl}
          onChange={setImageUrl}
          onError={(msg) => setError(msg)}
        />

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/evenimente"
            className="flex-1 text-center border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {loading ? "Se salvează..." : "Publică evenimentul"}
          </button>
        </div>
      </form>
    </div>
  );
}
