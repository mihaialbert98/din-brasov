"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

export default function IntraPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Email sau parolă incorecte.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-bold text-[#1a1a1a] text-center mb-8">
        Intră în cont
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="font-medium text-gray-700">
            Parolă
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            minLength={8}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
        >
          {loading ? "Se procesează..." : "Intră în cont"}
        </button>

        {googleEnabled && (
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Continuă cu Google
          </button>
        )}
      </form>

      <p className="text-center text-gray-600 mt-6">
        Nu ai cont?{" "}
        <Link href="/cont-nou" className="text-[#d4820a] font-medium hover:underline">
          Înregistrează-te
        </Link>
      </p>
    </div>
  );
}
