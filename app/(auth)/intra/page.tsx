"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

function IntraForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [lastEmail, setLastEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // Banners driven by the redirect after register / confirm.
  const needsConfirm = searchParams.get("needsConfirm") === "1";
  const confirmed = searchParams.get("confirmat") === "1";
  const confirmInvalid = searchParams.get("confirmare") === "invalid";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setResendState("idle");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    setLastEmail(email);
    const result = await signIn("credentials", {
      email,
      password: form.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      // NextAuth surfaces the thrown reason (unconfirmed / banned) generically;
      // distinguish the unconfirmed case so the user knows to check their email.
      const isUnconfirmed = result.code === "unconfirmed" || /confirmat/i.test(result.error);
      setUnconfirmed(isUnconfirmed);
      setError(
        isUnconfirmed
          ? "Contul nu este confirmat. Verifică-ți email-ul și apasă pe linkul de confirmare."
          : "Email sau parolă incorecte."
      );
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function handleResend() {
    if (!lastEmail) return;
    setResendState("sending");
    await fetch("/api/auth/resend-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: lastEmail }),
    }).catch(() => {});
    setResendState("sent");
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-bold text-[#1a1a1a] text-center mb-8">
        Intră în cont
      </h1>

      {needsConfirm && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-4">
          📧 Ți-am trimis un email de confirmare. Verifică-ți inbox-ul (și folderul Spam) și apasă pe link pentru a-ți activa contul.
        </div>
      )}
      {confirmed && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm mb-4">
          ✅ Cont confirmat cu succes! Acum te poți autentifica.
        </div>
      )}
      {confirmInvalid && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          ⚠️ Linkul de confirmare este invalid sau a fost deja folosit. Dacă ți-ai confirmat deja contul, autentifică-te.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
            {unconfirmed && (
              <div className="mt-2">
                {resendState === "sent" ? (
                  <span className="text-green-700">Email de confirmare retrimis. Verifică-ți inbox-ul.</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendState === "sending"}
                    className="font-semibold text-[#c84b1e] underline hover:no-underline disabled:opacity-60"
                  >
                    {resendState === "sending" ? "Se trimite..." : "Retrimite emailul de confirmare"}
                  </button>
                )}
              </div>
            )}
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

export default function IntraPage() {
  return (
    <Suspense fallback={null}>
      <IntraForm />
    </Suspense>
  );
}
