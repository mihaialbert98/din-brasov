"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { compressFiles } from "@/lib/image-compress";

const MAX_IMAGES = 8;

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
}

export default function ListingImagesField({ images, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing("listingImage", {
    onBeforeUploadBegin: compressFiles,
    onClientUploadComplete: (res) => {
      const urls = (res ?? []).map((r) => r.url).filter(Boolean) as string[];
      if (urls.length) onChange([...images, ...urls].slice(0, MAX_IMAGES));
    },
    onUploadError: () => setError("Eroare la încărcarea imaginilor."),
  });

  const remaining = MAX_IMAGES - images.length;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;

    // No size cap — images are compressed (resized + re-encoded) before upload,
    // so even large phone photos end up well within the upload limit.
    for (const f of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        setError("Doar JPG, PNG sau WebP sunt acceptate.");
        return;
      }
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(`Poți adăuga maxim ${MAX_IMAGES} imagini.`);
    }
    await startUpload(toUpload);
  }

  function removeAt(idx: number) {
    onChange(images.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="font-medium text-gray-700">
        Fotografii <span className="text-gray-400 font-normal">(opțional, max {MAX_IMAGES})</span>
      </label>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((src, i) => (
            <div key={src} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
              <img src={src} alt={`Fotografie ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 bg-accent text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  Principală
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Elimină fotografia ${i + 1}`}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/60 text-white rounded-full hover:bg-black/80"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-accent transition-colors">
          {isUploading ? (
            <p className="text-gray-500 text-sm">Se încarcă...</p>
          ) : (
            <>
              <p className="text-gray-500 text-sm mb-1">Apasă pentru a adăuga fotografii</p>
              <p className="text-xs text-gray-400">JPG, PNG, WebP · {remaining} {remaining === 1 ? "loc rămas" : "locuri rămase"}</p>
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFiles}
            disabled={isUploading}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
