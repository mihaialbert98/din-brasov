"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import type { Metadata } from "next";

export default function StergereContPage() {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users/me", { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "A apărut o eroare.");
      return;
    }
    setDone(true);
    await signOut({ redirect: false });
  }

  if (done) {
    return (
      <div className="w-full max-w-sm text-center">
        <p className="text-2xl mb-4">✅</p>
        <h1 className="text-2xl font-bold mb-4">Cerere înregistrată</h1>
        <p className="text-gray-600 mb-6">
          Contul tău va fi șters definitiv în 30 de zile. Anunțurile tale vor fi
          anonimizate imediat.
        </p>
        <Link href="/" className="text-[#d4820a] font-medium hover:underline">
          Înapoi la pagina principală
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-bold font-serif text-red-700 text-center mb-6">
        Ștergere cont
      </h1>

      <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 space-y-2 text-sm text-gray-700">
        <p className="font-semibold text-red-700">Ce se va șterge:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Contul tău și datele personale</li>
          <li>Parola și sesiunile active</li>
          <li>Numărul de telefon și emailul din anunțuri</li>
        </ul>
        <p className="font-semibold text-red-700 pt-2">Ce rămâne:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Anunțurile, dar fără datele tale de contact</li>
        </ul>
        <p className="pt-2 text-xs text-gray-500">
          Ștergerea definitivă se face după 30 de zile (perioadă de grație GDPR).
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-100 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 w-5 h-5 accent-red-600"
        />
        <span className="text-sm text-gray-700">
          Am înțeles că datele mele vor fi șterse definitiv și că această acțiune nu poate fi anulată.
        </span>
      </label>

      <button
        onClick={handleDelete}
        disabled={!confirmed || loading}
        className="w-full bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
      >
        {loading ? "Se procesează..." : "Șterge contul definitiv"}
      </button>

      <Link
        href="/profil"
        className="block text-center text-gray-500 hover:underline mt-4 py-2"
      >
        Renunță — înapoi la profil
      </Link>
    </div>
  );
}
