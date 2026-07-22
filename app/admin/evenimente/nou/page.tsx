"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ImageField from "@/components/admin/ImageField";
import AddressMapCheck from "@/components/admin/AddressMapCheck";

const CATEGORIES = ["Cultură", "Sport", "Muzică", "Food", "Business", "Educație", "Altele"];

// Fields the prefill can populate — kept as controlled state so a pasted link can
// fill them while staying fully editable.
const EMPTY_FORM = {
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  locationName: "",
  address: "",
  category: "",
  externalUrl: "",
  price: "",
};

export default function NouEvenimentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isFree, setIsFree] = useState(true);
  const [fields, setFields] = useState(EMPTY_FORM);

  // Prefill-from-link state
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  // Set when the prefilled description is Facebook's generated summary, not the
  // organizer's real text — prompts the admin to replace it.
  const [descIsFbSummary, setDescIsFbSummary] = useState(false);

  function setField(key: keyof typeof EMPTY_FORM, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handlePrefill() {
    const url = prefillUrl.trim();
    if (!url) return;
    setPrefilling(true);
    setPrefillNote(null);
    setDescIsFbSummary(false);
    setError(null);
    try {
      const res = await fetch("/api/events/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "N-am putut citi linkul.");
        return;
      }

      const filled: string[] = [];
      setFields((f) => {
        const next = { ...f };
        const apply = (key: keyof typeof EMPTY_FORM, label: string, val?: string) => {
          if (val) { next[key] = val; filled.push(label); }
        };
        apply("title", "titlu", data.title);
        apply("description", "descriere", data.description);
        apply("startsAt", "data început", data.startsAt);
        apply("endsAt", "data sfârșit", data.endsAt);
        apply("locationName", "locație", data.locationName);
        apply("address", "adresă", data.address);
        apply("price", "preț", data.price);
        // Always carry the source link into the external-link field.
        next.externalUrl = data.externalUrl ?? url;
        return next;
      });
      if (data.imageUrl) { setImageUrl(data.imageUrl); filled.push("imagine"); }
      if (typeof data.isFree === "boolean") setIsFree(data.isFree);
      setDescIsFbSummary(!!data.descriptionIsFacebookSummary);

      if (data.warning) {
        setPrefillNote(data.warning);
      } else if (filled.length) {
        setPrefillNote(`Am completat: ${filled.join(", ")}. Verifică datele înainte de a publica.`);
      } else {
        setPrefillNote("N-am găsit date în acest link. Completează manual.");
      }
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setPrefilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fields.title,
        description: fields.description,
        startsAt: fields.startsAt,
        endsAt: fields.endsAt || undefined,
        locationName: fields.locationName || undefined,
        address: fields.address || undefined,
        category: fields.category || undefined,
        externalUrl: fields.externalUrl || undefined,
        isFree,
        price: isFree ? undefined : fields.price || undefined,
        currency: "RON",
        imageUrl: imageUrl || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    router.push("/admin/evenimente");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/evenimente" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Adaugă eveniment</h1>
      </div>

      {/* Prefill from a pasted link (Facebook event, Eventbrite, venue page…) */}
      <div className="bg-[#6bb5d4]/10 border border-[#6bb5d4]/40 rounded-xl p-4 mb-6">
        <label htmlFor="prefillUrl" className="font-medium text-gray-700 text-sm">
          Completează din link
        </label>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">
          Lipește linkul evenimentului (ex: Facebook) și completăm automat ce găsim. Poți edita
          orice câmp după. Facebook returnează adesea doar titlu, descriere și imagine — data și
          locația le poți adăuga manual.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            id="prefillUrl"
            type="url"
            value={prefillUrl}
            onChange={(e) => setPrefillUrl(e.target.value)}
            placeholder="https://facebook.com/events/..."
            className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e]"
          />
          <button
            type="button"
            onClick={handlePrefill}
            disabled={prefilling || !prefillUrl.trim()}
            className="bg-[#6bb5d4] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#5aa3c2] transition-colors disabled:opacity-50"
          >
            {prefilling ? "Se citește..." : "Completează"}
          </button>
        </div>
        {prefillNote && <p className="text-xs text-gray-600 mt-2">{prefillNote}</p>}
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
            id="title" name="title" type="text" required maxLength={200}
            value={fields.title} onChange={(e) => setField("title", e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-medium text-gray-700">Descriere *</label>
          {descIsFbSummary && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-1">
              ⚠️ Aceasta e descrierea generată automat de Facebook (nu textul real al
              organizatorului — Facebook nu îl pune la dispoziție). Înlocuiește-o cu textul
              real al evenimentului.
            </div>
          )}
          <textarea
            id="description" name="description" required minLength={10} rows={4}
            value={fields.description}
            onChange={(e) => { setField("description", e.target.value); if (descIsFbSummary) setDescIsFbSummary(false); }}
            className={`border rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y ${descIsFbSummary ? "border-amber-300 bg-amber-50/40" : "border-gray-300"}`}
          />
          <span className="text-xs text-gray-400">Minim 10 caractere.</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="startsAt" className="font-medium text-gray-700">Data început *</label>
            <input
              id="startsAt" name="startsAt" type="datetime-local" required
              value={fields.startsAt} onChange={(e) => setField("startsAt", e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="endsAt" className="font-medium text-gray-700">Data sfârșit</label>
            <input
              id="endsAt" name="endsAt" type="datetime-local"
              value={fields.endsAt} onChange={(e) => setField("endsAt", e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="locationName" className="font-medium text-gray-700">Locație</label>
            <input
              id="locationName" name="locationName" type="text" maxLength={200}
              placeholder="ex: Piața Sfatului"
              value={fields.locationName} onChange={(e) => setField("locationName", e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="font-medium text-gray-700">Categorie</label>
            <select
              id="category" name="category"
              value={fields.category} onChange={(e) => setField("category", e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            >
              <option value="">Fără categorie</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="address" className="font-medium text-gray-700">Adresă</label>
          <input
            id="address" name="address" type="text" maxLength={300}
            placeholder="ex: Piața Sfatului 1, Brașov"
            value={fields.address} onChange={(e) => setField("address", e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
          <AddressMapCheck address={fields.address} name={fields.locationName} />
        </div>

        <div className="flex flex-col gap-3">
          <label className="font-medium text-gray-700">Intrare</label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="w-5 h-5 accent-[#c84b1e]"
            />
            <span className="text-gray-700">Intrare liberă</span>
          </label>
          {!isFree && (
            <div className="flex items-center gap-3">
              <input
                name="price" type="number" min="0" step="0.01" placeholder="Preț"
                value={fields.price} onChange={(e) => setField("price", e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] w-40"
              />
              <span className="text-gray-500 font-medium">RON</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="externalUrl" className="font-medium text-gray-700">Link extern</label>
          <input
            id="externalUrl" name="externalUrl" type="url"
            placeholder="https://facebook.com/events/... sau eventbrite.ro/..."
            value={fields.externalUrl} onChange={(e) => setField("externalUrl", e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <ImageField
          // Remount when a prefilled image URL arrives so the field picks it up
          // (ImageField seeds its mode/preview from `value` only on mount).
          key={imageUrl ? "img-set" : "img-empty"}
          endpoint="eventImage"
          value={imageUrl}
          onChange={setImageUrl}
          onError={(msg) => setError(msg)}
        />

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/evenimente"
            className="flex-1 text-center border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {loading ? "Se salvează..." : "Publică evenimentul"}
          </button>
        </div>
      </form>
    </div>
  );
}
