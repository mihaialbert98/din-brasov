"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Infinity as InfinityIcon, PartyPopper, Lock, CreditCard, AlertTriangle } from "lucide-react";
import ListingImagesField from "@/components/marketplace/ListingImagesField";
import ListingRules from "@/components/marketplace/ListingRules";

const CATEGORIES = ["Electronice", "Mobilă", "Haine", "Auto", "Imobiliare", "Sport", "Servicii", "Joburi", "Altele"];
const CONDITIONS = [
  { value: "new", label: "Nou" },
  { value: "used", label: "Folosit" },
  { value: "not_applicable", label: "Nu se aplică (servicii, joburi)" },
];

const LISTING_PRICE_RON = 9;

export function NouAnuntForm({
  currentCount,
  allowance,
  exempt,
  hasReusableSlot = false,
  paymentsEnabled,
}: {
  currentCount: number;
  allowance: number;
  exempt: boolean;
  hasReusableSlot?: boolean;
  paymentsEnabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);

  // Admin/moderator post unlimited (server-enforced) — never blocked, never charged.
  // Quota is based on CURRENT free listings (active + expired-in-grace), so deleting
  // or letting one expire frees a slot. A vacated paid slot also lets the user post
  // one free replacement, so it counts as "free" here too.
  const freeRemaining = exempt ? Infinity : Math.max(0, allowance - currentCount);
  const isFree = exempt || freeRemaining > 0 || hasReusableSlot;
  // Quota reached, no reusable slot, and payments aren't live yet → block.
  const blocked = !isFree && !paymentsEnabled;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blocked) return; // server also enforces this
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
        images: images.length > 0 ? images : undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok && res.status !== 202) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    if (data.needsPayment && data.paymentUrl) {
      // Redirect to Netopia hosted payment page
      window.location.href = data.paymentUrl;
      return;
    }

    router.push(`/anunturi/${data.slug}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/anunturi" className="inline-flex items-center gap-1 text-faint hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Înapoi
        </Link>
        <h1 className="text-3xl font-bold font-serif text-ink">Adaugă anunț</h1>
      </div>

      {/* Free quota banner */}
      <div className={`rounded-xl px-4 py-3 mb-6 text-sm flex items-center gap-3 ${
        isFree
          ? "bg-green-50 border border-green-200 text-green-800"
          : blocked
          ? "bg-red-50 border border-red-200 text-red-800"
          : "bg-amber-50 border border-amber-200 text-amber-800"
      }`}>
        <span className="flex-shrink-0" aria-hidden>
          {exempt ? <InfinityIcon className="w-5 h-5" /> : isFree ? <PartyPopper className="w-5 h-5" /> : blocked ? <Lock className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
        </span>
        <div>
          {exempt ? (
            <span>
              <strong>Cont echipă</strong> — poți publica anunțuri nelimitate, gratuit.
            </span>
          ) : freeRemaining <= 0 && hasReusableSlot ? (
            <span>
              Ai un <strong>slot plătit disponibil</strong>. Poți publica încă un anunț gratuit, pentru
              zilele rămase din slot. (Înlocuire unică.)
            </span>
          ) : isFree ? (
            <span>
              Folosești <strong>{currentCount} din {allowance}</strong> anunțuri active gratuite.
              {" "}Mai poți publica <strong>{freeRemaining}</strong>.
            </span>
          ) : blocked ? (
            <span>
              Ai atins limita de <strong>{allowance} anunțuri active</strong>. Șterge un anunț sau
              așteaptă expirarea ca să publici altul. Plata pentru anunțuri suplimentare va fi
              disponibilă în curând.
            </span>
          ) : (
            <span>
              Ai atins limita de {allowance} anunțuri active gratuite. Publicarea acestui anunț costă{" "}
              <strong>{LISTING_PRICE_RON} RON</strong>. Vei fi redirecționat la plată.
            </span>
          )}
        </div>
      </div>

      <ListingRules allowance={allowance} />

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="font-medium text-gray-700">Titlu *</label>
          <input
            id="title" name="title" type="text" required minLength={3} maxLength={200}
            placeholder="ex: Bicicletă mountain bike Trek, stare bună"
            className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere *</label>
          <textarea
            id="description" name="description" required minLength={10} maxLength={5000} rows={5}
            placeholder="Descrie anunțul cât mai detaliat: stare, caracteristici, motive vânzare..."
            className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="font-medium text-gray-700">Categorie *</label>
            <select
              id="category" name="category" required defaultValue=""
              className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent"
            >
              <option value="" disabled>Alege categoria</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="condition" className="font-medium text-gray-700">Stare</label>
            <select
              id="condition" name="condition" defaultValue="used"
              className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent"
            >
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="price" className="font-medium text-gray-700">Preț (RON)</label>
            <input
              id="price" name="price" type="text" maxLength={20}
              placeholder="ex: 500 sau lasă gol pentru negociabil"
              className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="location" className="font-medium text-gray-700">Locație</label>
            <input
              id="location" name="location" type="text" maxLength={200}
              placeholder="ex: Brașov, Schei"
              className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <ListingImagesField images={images} onChange={setImages} />

        <div className="flex flex-col gap-1">
          <label htmlFor="contactPhone" className="font-medium text-gray-700">Telefon de contact</label>
          <input
            id="contactPhone" name="contactPhone" type="tel" maxLength={20}
            placeholder="ex: 0722 123 456"
            className="border border-hairline rounded-lg px-4 py-3 text-base text-ink bg-white focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-gray-400">Ascuns în pagina anunțului — vizibil doar utilizatorilor autentificați. Cumpărătorii te pot contacta și prin mesaje în aplicație.</p>
        </div>

        <p className="text-xs text-gray-400 border-t pt-4">
          Anunțul va fi activ 30 de zile. Prin publicare ești de acord cu termenii platformei.
        </p>

        <div className="flex gap-3 pt-1">
          <Link
            href="/anunturi"
            className="flex-1 text-center border border-hairline text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading || blocked}
            className="flex-1 bg-accent text-white font-semibold py-3 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {blocked
              ? "Limită atinsă"
              : loading
              ? (isFree ? "Se publică..." : "Redirecționare la plată...")
              : (isFree ? "Publică anunțul" : `Plătește ${LISTING_PRICE_RON} RON și publică`)}
          </button>
        </div>
      </form>
    </div>
  );
}
