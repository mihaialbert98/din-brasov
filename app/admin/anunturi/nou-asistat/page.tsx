"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["Electronice", "Mobilă", "Haine", "Auto", "Imobiliare", "Servicii", "Joburi", "Altele"];

export default function NouAsistatPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentTicked, setConsentTicked] = useState(false);
  const [withdrawalInformed, setWithdrawalInformed] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consentTicked) {
      setError("Trebuie să confirmi că ai obținut consimțământul verbal al apelantului.");
      return;
    }
    if (!withdrawalInformed) {
      setError("Trebuie să confirmi că apelantul a fost informat despre dreptul de retragere.");
      return;
    }
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/listings/assisted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        price: form.get("price"),
        currency: form.get("currency"),
        category: form.get("category"),
        condition: form.get("condition"),
        location: form.get("location"),
        contactPhone: form.get("contactPhone"),
        callerName: form.get("callerName"),
        staffConsentTicked: true,
        withdrawalInformed: true,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "A apărut o eroare.");
      return;
    }
    router.push("/admin/anunturi");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Anunț Asistat</h1>
      <p className="text-gray-500 mb-8">
        Completează detaliile anunțului în locul apelantului. Anunțul va fi marcat ca &ldquo;Anunț Asistat&rdquo;.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* GDPR consent checkboxes — legally required (Art. 7(1) + Law 190/2018) */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
            Documentare consimțământ verbal — GDPR Art. 7 · Legea 190/2018
          </p>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentTicked}
              onChange={(e) => setConsentTicked(e.target.checked)}
              required
              className="mt-1 w-5 h-5 accent-amber-600 flex-shrink-0"
            />
            <span className="text-sm text-amber-900">
              <strong>Consimțământ verbal obținut</strong> — Confirm că apelantul și-a dat
              acordul verbal explicit pentru publicarea anunțului și a numărului de telefon
              pe platforma Din Brașov, și că i-am explicat scopul prelucrării.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={withdrawalInformed}
              onChange={(e) => setWithdrawalInformed(e.target.checked)}
              required
              className="mt-1 w-5 h-5 accent-amber-600 flex-shrink-0"
            />
            <span className="text-sm text-amber-900">
              <strong>Drept de retragere explicat</strong> — Confirm că am informat apelantul
              că poate solicita oricând ștergerea anunțului sunând la același număr sau
              contactând echipa Din Brașov.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="callerName" className="font-medium text-gray-700">
            Numele apelantului <span className="text-gray-400 font-normal">(opțional, pentru log)</span>
          </label>
          <input id="callerName" name="callerName" type="text"
            placeholder="ex: Ion Popescu"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="font-medium text-gray-700">Titlu anunț *</label>
          <input id="title" name="title" type="text" required
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere *</label>
          <textarea id="description" name="description" required rows={5}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731] resize-y" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="price" className="font-medium text-gray-700">Preț</label>
            <input id="price" name="price" type="text"
              placeholder="ex: 500"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="currency" className="font-medium text-gray-700">Monedă</label>
            <select id="currency" name="currency" defaultValue="RON"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]">
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="font-medium text-gray-700">Categorie *</label>
          <select id="category" name="category" required
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]">
            <option value="">Selectează categoria</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="condition" className="font-medium text-gray-700">Stare</label>
          <select id="condition" name="condition" defaultValue="used"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]">
            <option value="new">Nou</option>
            <option value="used">Folosit</option>
            <option value="not_applicable">Nu se aplică</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="location" className="font-medium text-gray-700">Locație</label>
          <input id="location" name="location" type="text"
            placeholder="ex: Brașov, Centru"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="contactPhone" className="font-medium text-gray-700">
            Telefon de contact al apelantului *
          </label>
          <input id="contactPhone" name="contactPhone" type="tel" required
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#1a4731]" />
        </div>

        <button
          type="submit" disabled={loading || !consentTicked || !withdrawalInformed}
          className="w-full bg-[#d4820a] text-white font-semibold py-3 rounded-lg hover:bg-[#e8a020] transition-colors disabled:opacity-50"
        >
          {loading ? "Se publică..." : "Publică anunțul asistat"}
        </button>
      </form>
    </div>
  );
}
