"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import ImageField from "@/components/admin/ImageField";

const CATEGORIES = ["Aventură", "Sport", "Cultură", "Gastronomie", "Natură", "Altele"];

export default function EditExperientaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    fetch(`/api/experiences/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setTitle(data.title ?? "");
        setDescription(data.description ?? "");
        setExternalUrl(data.externalUrl ?? "");
        setCategory(data.category ?? "");
        setImageUrl(data.imageUrl ?? "");
        setLoading(false);
      })
      .catch(() => { setError("Eroare la încărcarea datelor."); setLoading(false); });
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/experiences/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, externalUrl, category: category || null, imageUrl: imageUrl || null }),
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
    setDeleting(true);
    const res = await fetch(`/api/experiences/${params.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push("/admin/experiente");
    } else {
      setError("Eroare la ștergere.");
      setConfirmDelete(false);
    }
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">Se încarcă...</div>;

  return (
    <div className="max-w-2xl">
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
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                disabled={deleting}
              >
                Anulează
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
                disabled={deleting}
              >
                {deleting ? "Se șterge..." : "Șterge"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/experiente" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Editează experiența</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Titlu *</label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Descriere *</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] resize-y"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Link rezervare / detalii *</label>
          <input
            type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium text-gray-700">Categorie</label>
          <select
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] bg-white"
          >
            <option value="">Fără categorie</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <ImageField
          endpoint="eventImage"
          value={imageUrl}
          onChange={setImageUrl}
          onError={(msg) => setError(msg)}
        />

        {saved && <p className="text-sm text-green-700 font-medium">✓ Modificările au fost salvate.</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setConfirmDelete(true)}
            className="border border-red-300 text-red-600 font-medium px-5 py-2.5 rounded-lg text-sm hover:bg-red-50 transition-colors"
          >
            Șterge
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#c84b1e] text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {saving ? "Se salvează..." : "Salvează"}
          </button>
        </div>
      </div>
    </div>
  );
}
