"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const CATEGORIES = ["Electronice", "Mobilă", "Haine", "Auto", "Imobiliare", "Sport", "Servicii", "Joburi", "Altele"];
const CONDITIONS = [
  { value: "new", label: "Nou" },
  { value: "used", label: "Folosit" },
  { value: "not_applicable", label: "Nu se aplică (servicii, joburi)" },
];

export default function NouAnuntPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        price: form.get("price") || undefined,
        category: form.get("category"),
        condition: form.get("condition"),
        location: form.get("location") || undefined,
        contactPhone: form.get("contactPhone") || undefined,
        contactEmail: form.get("contactEmail") || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    router.push(`/anunturi/${data.slug}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/anunturi" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-3xl font-bold font-serif text-[#1a4731]">Adaugă anunț</h1>
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
            id="title" name="title" type="text" required minLength={3} maxLength={200}
            placeholder="ex: Bicicletă mountain bike Trek, stare bună"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere *</label>
          <textarea
            id="description" name="description" required minLength={10} maxLength={5000} rows={5}
            placeholder="Descrie anunțul cât mai detaliat: stare, caracteristici, motive vânzare..."
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="font-medium text-gray-700">Categorie *</label>
            <select
              id="category" name="category" required defaultValue=""
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            >
              <option value="" disabled>Alege categoria</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="condition" className="font-medium text-gray-700">Stare</label>
            <select
              id="condition" name="condition" defaultValue="used"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            >
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="price" className="font-medium text-gray-700">Preț (RON)</label>
            <input
              id="price" name="price" type="text" maxLength={20}
              placeholder="ex: 500 sau lasă gol pentru negociabil"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="location" className="font-medium text-gray-700">Locație</label>
            <input
              id="location" name="location" type="text" maxLength={200}
              placeholder="ex: Brașov, Schei"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="contactPhone" className="font-medium text-gray-700">Telefon de contact</label>
          <input
            id="contactPhone" name="contactPhone" type="tel" maxLength={20}
            placeholder="ex: 0722 123 456"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
          />
          <p className="text-xs text-gray-400">Ascuns în pagina anunțului — vizibil doar utilizatorilor autentificați</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="contactEmail" className="font-medium text-gray-700">Email de contact</label>
          <input
            id="contactEmail" name="contactEmail" type="email"
            placeholder="ex: adresa@email.ro"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <p className="text-xs text-gray-400 border-t pt-4">
          Anunțul va fi activ 30 de zile. Prin publicare ești de acord cu termenii platformei.
        </p>

        <div className="flex gap-3 pt-1">
          <Link
            href="/anunturi"
            className="flex-1 text-center border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {loading ? "Se publică..." : "Publică anunțul"}
          </button>
        </div>
      </form>
    </div>
  );
}
