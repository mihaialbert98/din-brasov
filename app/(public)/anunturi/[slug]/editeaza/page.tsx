"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

const CATEGORIES = ["Electronice", "Mobilă", "Haine", "Auto", "Imobiliare", "Sport", "Servicii", "Joburi", "Altele"];
const CONDITIONS = [
  { value: "new", label: "Nou" },
  { value: "used", label: "Folosit" },
  { value: "not_applicable", label: "Nu se aplică (servicii, joburi)" },
];

export default function EditeazaAnuntPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [listingId, setListingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("used");
  const [location, setLocation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  useEffect(() => {
    // Fetch listing by slug first to get its id
    fetch(`/api/listings/by-slug/${params.slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => {
        setListingId(data.id);
        setTitle(data.title ?? "");
        setDescription(data.description ?? "");
        setPrice(data.price ?? "");
        setCategory(data.category ?? "");
        setCondition(data.condition ?? "used");
        setLocation(data.location ?? "");
        setContactPhone(data.contactPhone ?? "");
        setContactEmail(data.contactEmail ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Anunț negăsit sau nu ai permisiunea de a-l edita.");
        setLoading(false);
      });
  }, [params.slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!listingId) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        price: price || null,
        category,
        condition,
        location: location || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la salvare.");
    }
  }

  async function handleDelete() {
    if (!listingId) return;
    setDeleting(true);
    const res = await fetch(`/api/listings/${listingId}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push("/profil");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la ștergere.");
      setConfirmDelete(false);
    }
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">Se încarcă...</div>;

  if (error && !listingId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
        <Link href="/profil" className="mt-4 inline-block text-sm text-[#c84b1e] hover:underline">
          ← Înapoi la profil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Confirmare ștergere</h3>
            <p className="text-gray-600 text-sm">
              Ești sigur că vrei să ștergi <span className="font-semibold">„{title}"</span>? Acțiunea este ireversibilă.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Anulează
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Se șterge..." : "Șterge"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <Link href="/profil" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Editează anunțul</h1>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Titlu *</label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            required minLength={3} maxLength={200}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Descriere *</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            required minLength={10} maxLength={5000} rows={5}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-medium text-gray-700">Categorie *</label>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)} required
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            >
              <option value="" disabled>Alege categoria</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-medium text-gray-700">Stare</label>
            <select
              value={condition} onChange={(e) => setCondition(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            >
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-medium text-gray-700">Preț (RON)</label>
            <input
              type="text" value={price} onChange={(e) => setPrice(e.target.value)} maxLength={20}
              placeholder="Lasă gol pentru negociabil"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-medium text-gray-700">Locație</label>
            <input
              type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200}
              placeholder="ex: Brașov, Schei"
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Telefon de contact</label>
          <input
            type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={20}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Email de contact</label>
          <input
            type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        {saved && (
          <p className="text-sm text-green-700 font-medium">✓ Modificările au fost salvate.</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="border border-red-300 text-red-600 font-medium px-5 py-2.5 rounded-lg text-sm hover:bg-red-50 transition-colors"
          >
            Șterge anunțul
          </button>
          <div className="flex-1" />
          <button
            type="submit"
            disabled={saving}
            className="bg-[#c84b1e] text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {saving ? "Se salvează..." : "Salvează"}
          </button>
        </div>
      </form>
    </div>
  );
}
