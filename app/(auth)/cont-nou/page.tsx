"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import FoundingMemberBanner from "@/components/promo/FoundingMemberBanner";

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

function ContNouForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Diners arrive from the menu with ?callbackUrl=/ so they return to the platform
  // after a one-tap Google signup. Default to home for direct visitors.
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/founding-spots")
      .then((r) => r.json())
      .then((d) => setSpotsLeft(d.spotsLeft ?? 0))
      .catch(() => {});
  }, []);

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
        wantsExperiences: form.get("wantsExperiences") === "on",
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    // No auto sign-in — the account must be confirmed via the email link first.
    router.push("/intra?needsConfirm=1");
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-bold font-serif text-[#1a4731] text-center mb-8">
        Cont nou
      </h1>

      {spotsLeft !== null && spotsLeft > 0 && (
        <FoundingMemberBanner spotsLeft={spotsLeft} variant="compact" />
      )}

      {/* Google-first: one tap, no password, no email confirmation. */}
      {googleEnabled && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 bg-white text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.48 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/>
            </svg>
            Continuă cu Google
          </button>
          <div className="flex items-center gap-3 my-5">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">sau cu email</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
        </div>
      )}

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
              { name: "wantsExperiences", label: "Experiențe noi" },
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

export default function ContNouPage() {
  return (
    <Suspense fallback={null}>
      <ContNouForm />
    </Suspense>
  );
}
