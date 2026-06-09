"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadButton } from "@/lib/uploadthing-client";

const CATEGORIES = ["Actualitate", "Sport", "Cultură", "Business", "Sănătate", "Altele"] as const;

interface Props {
  id: string;
  initial: {
    title: string;
    excerpt: string;
    sourceName: string;
    category: string | null;
    imageUrl: string | null;
  };
}

export default function NewsEditForm({ id, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [sourceName, setSourceName] = useState(initial.sourceName);
  const [category, setCategory] = useState(initial.category ?? "");
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/news/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, excerpt, sourceName, category: category || undefined, imageUrl: imageUrl || undefined }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Eroare la salvare.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Titlu</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c84b1e]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rezumat <span className="text-gray-400 font-normal">({excerpt.length}/300)</span>
        </label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          maxLength={300}
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c84b1e] resize-none"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sursă</label>
          <input
            type="text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c84b1e]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c84b1e] bg-white"
          >
            <option value="">— selectează —</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Imagine</label>
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg mb-2" />
            <p className="text-xs text-gray-400 mb-2">Înlocuiește imaginea:</p>
          </>
        ) : (
          <div className="w-full h-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center mb-2 bg-gray-50">
            <p className="text-sm text-gray-400">Nicio imagine — adaugă una</p>
          </div>
        )}
        <UploadButton
          endpoint="newsImage"
          onClientUploadComplete={(files) => {
            if (files[0]) setImageUrl(files[0].url);
          }}
          onUploadError={() => setError("Eroare la upload imagine.")}
          appearance={{
            button: "bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors",
            allowedContent: "hidden",
          }}
        />
      </div>

      {saved && <p className="text-sm text-green-700 font-medium">✓ Modificările au fost salvate.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Se salvează..." : "Salvează modificările"}
      </button>
    </div>
  );
}
