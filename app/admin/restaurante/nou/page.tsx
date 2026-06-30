"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NouRestaurantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    // Initial tables: a count → auto-labeled Masa 1…N server-side.
    const tableCount = parseInt(String(form.get("tableCount") ?? "")) || 0;

    const res = await fetch("/api/admin/restaurants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        ownerEmail: form.get("ownerEmail"),
        description: form.get("description") || undefined,
        address: form.get("address") || undefined,
        phone: form.get("phone") || undefined,
        tableCount: tableCount > 0 ? tableCount : undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    router.push("/admin/restaurante");
  }

  const field =
    "border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/restaurante" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Adaugă restaurant</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="font-medium text-gray-700">Nume restaurant *</label>
          <input id="name" name="name" type="text" required maxLength={200} className={field} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ownerEmail" className="font-medium text-gray-700">Email proprietar *</label>
          <input id="ownerEmail" name="ownerEmail" type="email" required className={field} />
          <span className="text-xs text-gray-400">
            Proprietarul trebuie să aibă deja cont pe Din Brașov. Va putea gestiona meniul și personalul.
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere</label>
          <textarea id="description" name="description" rows={3} maxLength={2000} className={`${field} resize-y`} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="address" className="font-medium text-gray-700">Adresă</label>
            <input id="address" name="address" type="text" maxLength={300} className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="font-medium text-gray-700">Telefon</label>
            <input id="phone" name="phone" type="text" maxLength={50} className={field} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tableCount" className="font-medium text-gray-700">Număr de mese (opțional)</label>
          <input
            id="tableCount" name="tableCount" type="number" min={0} max={100} defaultValue={0}
            className={`${field} w-32`}
          />
          <span className="text-xs text-gray-400">
            Mesele se numerotează automat: Masa 1, Masa 2, … Fiecare primește un cod QR unic. Poți adăuga mese și mai târziu.
          </span>
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/restaurante"
            className="flex-1 text-center border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {loading ? "Se creează..." : "Creează restaurant"}
          </button>
        </div>
      </form>
    </div>
  );
}
