"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function ContNouPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      setError("Parolele nu coincid.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password,
        wantsNews: form.get("wantsNews") === "on",
        wantsEvents: form.get("wantsEvents") === "on",
        wantsPlaces: form.get("wantsPlaces") === "on",
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    // Auto sign-in after registration
    await signIn("credentials", {
      email: form.get("email"),
      password,
      redirect: false,
    });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] text-center mb-8">
        Cont nou
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="font-medium text-gray-700">Nume</label>
          <input
            id="name" name="name" type="text" required
            autoComplete="name"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="font-medium text-gray-700">Email</label>
          <input
            id="email" name="email" type="email" required
            autoComplete="email"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="font-medium text-gray-700">Parolă</label>
          <input
            id="password" name="password" type="password" required minLength={8}
            autoComplete="new-password"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirm" className="font-medium text-gray-700">Confirmare parolă</label>
          <input
            id="confirm" name="confirm" type="password" required minLength={8}
            autoComplete="new-password"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <fieldset className="border-t border-gray-100 pt-4">
          <legend className="font-medium text-gray-700 mb-2 text-sm">Vreau să primesc pe email (opțional):</legend>
          <div className="flex flex-col gap-2">
            {[
              { name: "wantsNews", label: "Știri" },
              { name: "wantsEvents", label: "Evenimente" },
              { name: "wantsPlaces", label: "Localuri noi" },
            ].map((c) => (
              <label key={c.name} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox" name={c.name} className="w-4 h-4 accent-[#c84b1e]" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-gray-500">
          Prin înregistrare, ești de acord cu{" "}
          <Link href="/despre" className="underline">termenii și condițiile</Link> și
          cu politica noastră de confidențialitate (GDPR).
        </p>

        <button
          type="submit" disabled={loading}
          className="w-full bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
        >
          {loading ? "Se procesează..." : "Creează cont"}
        </button>
      </form>

      <p className="text-center text-gray-600 mt-6">
        Ai deja cont?{" "}
        <Link href="/intra" className="text-[#d4820a] font-medium hover:underline">
          Intră în cont
        </Link>
      </p>
    </div>
  );
}
