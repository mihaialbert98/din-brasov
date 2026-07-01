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
  coverUrl,
  categories,
}: {
  restaurantName: string;
  tableLabel: string;
  logoUrl: string | null;
  coverUrl?: string | null;
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
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
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
      const y = el.getBoundingClientRect().top + window.scrollY - 84; // offset for sticky nav
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    window.setTimeout(() => { clickScrolling.current = false; }, 600);
  }

  return (
    <>
      {/* Hero — cover image if available, else a calm branded band. */}
      <header className="relative overflow-hidden">
        {coverUrl ? (
          <div className="relative h-44 sm:h-52">
            <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 px-5 pb-5 flex items-end gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/80 shadow-md flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="font-serif font-bold text-white text-2xl sm:text-3xl leading-tight [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] truncate">
                  {restaurantName}
                </h1>
                <p className="text-white/85 text-[13px] font-medium tracking-wide">{tableLabel}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 pt-8 pb-7 text-center" style={{ background: "var(--brand)" }}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="w-[72px] h-[72px] rounded-2xl object-cover mx-auto mb-3 ring-2 ring-white/70 shadow-md"
                style={{ background: "var(--brand-contrast)" }}
              />
            )}
            <h1 className="font-serif font-bold text-2xl sm:text-3xl leading-tight" style={{ color: "var(--brand-contrast)" }}>
              {restaurantName}
            </h1>
            <p className="mt-1 text-[13px] font-medium tracking-wide" style={{ color: "color-mix(in srgb, var(--brand-contrast) 85%, transparent)" }}>
              {tableLabel}
            </p>
          </div>
        )}
      </header>

      {/* Sticky category nav */}
      {categories.length > 1 && (
        <nav
          className="sticky top-0 z-20 border-b"
          style={{ background: "color-mix(in srgb, var(--menu-bg) 92%, transparent)", borderColor: "var(--menu-border)", backdropFilter: "blur(8px)" }}
        >
          <div className="flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-none max-w-2xl mx-auto">
            {categories.map((c) => {
              const active = activeId === c.id;
              return (
                <button
                  key={c.id}
                  ref={(el) => { chipRefs.current[c.id] = el; }}
                  onClick={() => scrollTo(c.id)}
                  aria-current={active ? "true" : undefined}
                  className="whitespace-nowrap text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition-colors duration-150"
                  style={
                    active
                      ? { background: "var(--brand)", color: "var(--brand-contrast)" }
                      : { background: "var(--menu-surface)", color: "var(--menu-muted)", boxShadow: "var(--menu-shadow-sm)" }
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Sections */}
      <div className="px-4 pt-5 pb-32 max-w-2xl mx-auto">
        {categories.map((cat) => (
          <section
            key={cat.id}
            id={cat.id}
            ref={(el) => { sectionRefs.current[cat.id] = el; }}
            className="scroll-mt-20 mb-9"
          >
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-serif font-bold text-[19px] tracking-tight" style={{ color: "var(--menu-text)" }}>
                {cat.name}
              </h2>
              <span className="h-px flex-1" style={{ background: "var(--menu-border)" }} />
            </div>

            <ul
              className="rounded-2xl overflow-hidden divide-y"
              style={{ background: "var(--menu-surface)", boxShadow: "var(--menu-shadow)", borderColor: "var(--menu-border)" }}
            >
              {cat.items.map((it) => (
                <li key={it.id} className="p-3.5 sm:p-4 flex gap-3.5" style={{ borderColor: "var(--menu-border)" }}>
                  {it.imageUrl && (
                    <div
                      className="w-[84px] h-[84px] sm:w-24 sm:h-24 flex-shrink-0 overflow-hidden"
                      style={{ borderRadius: "var(--menu-radius-sm)", background: "var(--menu-border)" }}
                    >
                      <img src={it.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-[15px] leading-snug break-words" style={{ color: "var(--menu-text)" }}>
                        {it.name}
                      </h3>
                      {it.price && (
                        <span className="font-bold text-[15px] whitespace-nowrap tabular-nums pl-1" style={{ color: "var(--brand)" }}>
                          {it.price} lei
                        </span>
                      )}
                    </div>
                    {it.description && (
                      <p className="text-[13px] mt-1 leading-relaxed line-clamp-3" style={{ color: "var(--menu-muted)" }}>
                        {it.description}
                      </p>
                    )}
                    {it.allergens.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {it.allergens.map((a) => (
                          <span
                            key={a}
                            className="text-[11px] leading-none px-2 py-1 rounded-full"
                            style={{ color: "var(--menu-muted)", background: "var(--menu-bg)" }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="text-center text-[11px] mt-8" style={{ color: "var(--menu-faint)" }}>
          Meniu digital prin <span className="font-semibold" style={{ color: "var(--menu-muted)" }}>Din Brașov</span>
        </footer>
      </div>
    </>
  );
}
