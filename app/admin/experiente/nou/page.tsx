"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ImageField from "@/components/admin/ImageField";

const CATEGORIES = ["Aventură", "Sport", "Cultură", "Gastronomie", "Natură", "Altele"];

export default function NouExperientaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        externalUrl: form.get("externalUrl"),
        category: form.get("category") || undefined,
        imageUrl: imageUrl || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    router.push("/admin/experiente");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/experiente" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Adaugă experiență</h1>
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
            placeholder="ex: Zbor cu parapanta deasupra Brașovului"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere *</label>
          <textarea
            id="description" name="description" required rows={4}
            placeholder="Descrie experiența pe scurt..."
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="externalUrl" className="font-medium text-gray-700">Link rezervare / detalii *</label>
          <input
            id="externalUrl" name="externalUrl" type="url" required
            placeholder="https://..."
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="font-medium text-gray-700">Categorie</label>
          <select
            id="category" name="category" defaultValue=""
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] bg-white"
          >
            <option value="">Fără categorie</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <ImageField
          endpoint="eventImage"
          value={imageUrl}
          onChange={setImageUrl}
          onError={(msg) => setError(msg)}
        />

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/experiente"
            className="flex-1 text-center border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {loading ? "Se salvează..." : "Publică experiența"}
          </button>
        </div>
      </form>
    </div>
  );
}
