"use client";

import { useState } from "react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { compressImage } from "@/lib/image-compress";

type Endpoint = "eventImage" | "newsImage" | "listingImage";

interface Props {
  endpoint: Endpoint;
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
}

export default function ImageField({ endpoint, value, onChange, onError }: Props) {
  const [mode, setMode] = useState<"upload" | "url">(value && !value.includes("/f/") ? "url" : "upload");
  const [urlInput, setUrlInput] = useState(value && !value.includes("/f/") ? value : "");
  const [preview, setPreview] = useState(value || "");

  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (res) => {
      if (res?.[0]?.url) {
        setPreview(res[0].url);
        onChange(res[0].url);
      }
    },
    onUploadError: () => onError("Eroare la încărcarea imaginii."),
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onError("Doar JPG, PNG sau WebP sunt acceptate.");
      return;
    }
    // No size cap — the image is compressed before upload.
    setPreview(URL.createObjectURL(file));
    const compressed = await compressImage(file);
    await startUpload([compressed]);
  }

  function handleUrlCommit() {
    const trimmed = urlInput.trim();
    setPreview(trimmed);
    onChange(trimmed);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="font-medium text-gray-700">Imagine</label>

      <div className="flex gap-2 mb-1">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            mode === "upload" ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Încarcă fișier
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            mode === "url" ? "bg-[#c84b1e] text-white border-[#c84b1e]" : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          URL imagine
        </button>
      </div>

      {mode === "upload" ? (
        preview && value?.includes("/f/") ? (
          <div className="relative">
            <img src={preview} alt="" className="w-full h-40 object-cover rounded-lg" />
            {isUploading && (
              <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                <p className="text-white font-medium text-sm">Se încarcă...</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => { setPreview(""); onChange(""); }}
              className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded hover:bg-black/70"
            >
              Elimină
            </button>
          </div>
        ) : (
          <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-[#c84b1e] transition-colors">
            {isUploading ? (
              <p className="text-gray-500 text-sm">Se încarcă...</p>
            ) : (
              <>
                <p className="text-gray-500 text-sm mb-1">Apasă pentru a încărca o imagine</p>
                <p className="text-xs text-gray-400">JPG, PNG, WebP · orice dimensiune</p>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFile}
              disabled={isUploading}
            />
          </label>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/imagine.jpg"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c84b1e]"
            />
            <button
              type="button"
              onClick={handleUrlCommit}
              className="bg-gray-100 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Previzualizare
            </button>
          </div>
          {preview && mode === "url" && (
            <div className="relative">
              <img src={preview} alt="" className="w-full h-40 object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => { setPreview(""); setUrlInput(""); onChange(""); }}
                className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded hover:bg-black/70"
              >
                Elimină
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
