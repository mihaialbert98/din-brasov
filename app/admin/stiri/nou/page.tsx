"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUploadThing } from "@/lib/uploadthing-client";
import { compressImage } from "@/lib/image-compress";

const CATEGORIES = ["Actualitate", "Sport", "Cultură", "Business", "Sănătate", "Altele"];

export default function NouStirePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing("newsImage", {
    onClientUploadComplete: (res) => {
      if (res?.[0]?.url) {
        setImageUrl(res[0].url);
      }
    },
    onUploadError: () => {
      setError("Eroare la încărcarea imaginii. Încearcă din nou.");
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Doar imagini JPG, PNG sau WebP sunt acceptate.");
      return;
    }
    // No size cap — the image is compressed before upload.

    setError(null);
    // Show local preview immediately
    setImagePreview(URL.createObjectURL(file));
    // Compress, then upload to Uploadthing
    const compressed = await compressImage(file);
    await startUpload([compressed]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        excerpt: form.get("excerpt"),
        sourceUrl: form.get("sourceUrl"),
        sourceName: form.get("sourceName"),
        category: form.get("category"),
        imageUrl: imageUrl ?? undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "A apărut o eroare. Încearcă din nou.");
      return;
    }

    router.push("/admin/stiri");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/stiri" className="text-gray-400 hover:text-gray-700 transition-colors">
          ← Înapoi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Adaugă știre</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="font-medium text-gray-700">Titlu *</label>
          <input
            id="title" name="title" type="text" required maxLength={200}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="excerpt" className="font-medium text-gray-700">
            Rezumat * <span className="text-gray-400 font-normal">(max 300 caractere)</span>
          </label>
          <textarea
            id="excerpt" name="excerpt" required maxLength={300} rows={4}
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e] focus:ring-1 focus:ring-[#c84b1e] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="sourceName" className="font-medium text-gray-700">
              Sursa * <span className="text-gray-400 font-normal">(ex: BZT.ro)</span>
            </label>
            <input
              id="sourceName" name="sourceName" type="text" required maxLength={100}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="font-medium text-gray-700">Categorie *</label>
            <select
              id="category" name="category" required defaultValue=""
              className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
            >
              <option value="" disabled>Selectează</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sourceUrl" className="font-medium text-gray-700">
            Link articol original *
          </label>
          <input
            id="sourceUrl" name="sourceUrl" type="url" required
            placeholder="https://..."
            className="border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#c84b1e]"
          />
        </div>

        {/* Image upload */}
        <div className="flex flex-col gap-2">
          <label className="font-medium text-gray-700">Imagine copertă</label>
          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
              {isUploading && (
                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                  <p className="text-white font-medium">Se încarcă...</p>
                </div>
              )}
              {!isUploading && imageUrl && (
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  ✓ Încărcat
                </div>
              )}
              <button
                type="button"
                onClick={() => { setImagePreview(null); setImageUrl(null); }}
                className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded hover:bg-black/70 transition-colors"
              >
                Elimină
              </button>
            </div>
          ) : (
            <label
              htmlFor="image-upload"
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-[#c84b1e] transition-colors"
            >
              <p className="text-gray-500 mb-1">Apasă pentru a încărca o imagine</p>
              <p className="text-xs text-gray-400">JPG, PNG, WebP · max 4MB</p>
              <input
                id="image-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/stiri"
            className="flex-1 text-center border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Anulează
          </Link>
          <button
            type="submit"
            disabled={loading || isUploading}
            className="flex-1 bg-[#c84b1e] text-white font-semibold py-3 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60"
          >
            {loading ? "Se publică..." : isUploading ? "Se încarcă imaginea..." : "Publică știrea"}
          </button>
        </div>
      </form>
    </div>
  );
}
