"use client";

import { useEffect, useRef, useState } from "react";

export interface MenuViewItem {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
  allergens: string[];
}
export interface MenuViewCategory {
  id: string;
  name: string;
  items: MenuViewItem[];
}

export default function MenuView({
  restaurantName,
  tableLabel,
  logoUrl,
  categories,
}: {
  restaurantName: string;
  tableLabel: string;
  logoUrl: string | null;
  categories: MenuViewCategory[];
}) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const clickScrolling = useRef(false);

  // Scroll-spy: highlight the category whose section is currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (clickScrolling.current) return;
        // Pick the topmost section that's intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Trigger when a section's heading passes just below the sticky nav.
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  // Keep the active chip scrolled into view within the horizontal nav.
  useEffect(() => {
    chipRefs.current[activeId]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  function scrollTo(id: string) {
    setActiveId(id);
    clickScrolling.current = true;
    const el = sectionRefs.current[id];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 88; // offset for sticky nav
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    // Re-enable scroll-spy after the smooth scroll settles.
    window.setTimeout(() => { clickScrolling.current = false; }, 600);
  }

  return (
    <>
      {/* Hero */}
      <header className="relative bg-[#c84b1e] text-white pt-8 pb-10 px-5 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_20%_-10%,#fff,transparent_40%)]" />
        <div className="relative">
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              className="w-20 h-20 rounded-full object-cover mx-auto mb-3 ring-4 ring-white/30 shadow-lg"
            />
          )}
          <h1 className="text-3xl font-serif font-bold leading-tight">{restaurantName}</h1>
          <p className="mt-1 text-sm text-white/80 uppercase tracking-wider">{tableLabel}</p>
        </div>
        {/* Curved bottom edge */}
        <div className="absolute -bottom-px left-0 right-0 h-6 bg-[#f4f1ec] rounded-t-[28px]" />
      </header>

      {/* Sticky category nav */}
      {categories.length > 1 && (
        <nav className="sticky top-0 z-20 bg-[#f4f1ec]/95 backdrop-blur-sm border-b border-black/5">
          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
            {categories.map((c) => (
              <button
                key={c.id}
                ref={(el) => { chipRefs.current[c.id] = el; }}
                onClick={() => scrollTo(c.id)}
                className={`whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                  activeId === c.id
                    ? "bg-[#c84b1e] text-white shadow-sm"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Sections */}
      <div className="px-4 pt-4 pb-32 max-w-lg mx-auto">
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={cat.id}
            ref={(el) => { sectionRefs.current[cat.id] = el; }}
            className="scroll-mt-24 mb-8"
          >
            <h2 className="text-xl font-serif font-bold text-gray-900 mb-4 flex items-center gap-3">
              {cat.name}
              <span className="h-px flex-1 bg-gradient-to-r from-[#c84b1e]/40 to-transparent" />
            </h2>

            <ul className="space-y-3">
              {cat.items.map((it) => (
                <li key={it.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex gap-3 p-3">
                    {it.imageUrl && (
                      <img
                        src={it.imageUrl}
                        alt=""
                        className="w-24 h-24 rounded-xl object-cover flex-shrink-0 bg-gray-100"
                      />
                    )}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-gray-900 leading-snug">{it.name}</h3>
                        {it.price && (
                          <span className="font-bold text-[#c84b1e] whitespace-nowrap text-[15px]">
                            {it.price} lei
                          </span>
                        )}
                      </div>
                      {it.description && (
                        <p className="text-sm text-gray-500 mt-1 leading-relaxed line-clamp-3">
                          {it.description}
                        </p>
                      )}
                      {it.allergens.length > 0 && (
                        <div className="mt-auto pt-2 flex flex-wrap gap-1">
                          {it.allergens.map((a) => (
                            <span
                              key={a}
                              className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="text-center text-xs text-gray-400 mt-8">
          Meniu digital prin <span className="font-semibold text-gray-500">Din Brașov</span>
        </footer>
      </div>
    </>
  );
}
