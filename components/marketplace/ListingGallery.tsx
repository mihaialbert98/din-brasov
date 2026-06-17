"use client";

import { useState } from "react";

export default function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;

  const current = images[Math.min(active, images.length - 1)];

  function go(delta: number) {
    setActive((i) => (i + delta + images.length) % images.length);
  }

  return (
    <div className="mb-6">
      {/* Main image */}
      <div className="relative rounded-xl overflow-hidden bg-gray-100">
        <img
          src={current}
          alt={`${title} — fotografie ${active + 1}`}
          className="w-full max-h-[28rem] object-contain bg-gray-50"
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Imaginea anterioară"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Imaginea următoare"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors"
            >
              ›
            </button>
            <span className="absolute bottom-2 right-2 bg-black/55 text-white text-xs px-2 py-0.5 rounded-full">
              {active + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Vezi fotografia ${i + 1}`}
              className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                i === active ? "border-[#c84b1e]" : "border-transparent hover:border-gray-300"
              }`}
            >
              <img src={src} alt="" className="h-16 w-16 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
