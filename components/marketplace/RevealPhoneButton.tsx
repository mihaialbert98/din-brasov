"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";

export function RevealPhoneButton({ listingId }: { listingId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    if (!session) {
      router.push("/intra");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/reveal-phone`, {
      method: "POST",
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setPhone(data.phone);
  }

  if (phone) {
    return (
      <a
        href={`tel:${phone}`}
        className="flex items-center gap-2 text-xl font-bold text-white hover:underline tabular-nums"
        aria-label={`Sună la ${phone}`}
      >
        <Phone className="w-5 h-5 flex-shrink-0" aria-hidden />
        {phone}
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={reveal}
        disabled={loading}
        className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm"
      >
        <Phone className="w-4 h-4 flex-shrink-0" aria-hidden />
        {loading ? "Se încarcă..." : session ? "Afișează numărul" : "Autentifică-te pentru a vedea numărul"}
      </button>
      {error && (
        <p role="alert" className="text-red-300 text-xs">{error}</p>
      )}
    </div>
  );
}
