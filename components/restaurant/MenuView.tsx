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
      const y = el.getBoundingClientRect().top + window.scrollY - 78; // offset for sticky nav
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    window.setTimeout(() => { clickScrolling.current = false; }, 600);
  }

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden">
        {coverUrl ? (
          <div className="relative h-52 sm:h-60">
            <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 px-6 pb-6 text-center">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover mx-auto mb-3 ring-1 ring-white/50 shadow-lg"
                />
              )}
              <h1 className="font-serif font-medium text-white text-[26px] sm:text-3xl leading-tight [text-shadow:0_1px_10px_rgba(0,0,0,0.55)] px-2">
                {restaurantName}
              </h1>
              <p className="mt-2 text-white/85 text-[11px] font-semibold uppercase tracking-[0.2em]">
                {tableLabel}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-6 pt-11 pb-9 text-center" style={{ background: "var(--brand)" }}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="w-[76px] h-[76px] rounded-full object-cover mx-auto mb-4 ring-1 shadow-md"
                style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--brand-contrast) 45%, transparent)" }}
              />
            )}
            <h1 className="font-serif font-medium text-[26px] sm:text-3xl leading-tight" style={{ color: "var(--brand-contrast)" }}>
              {restaurantName}
            </h1>
            <div className="mt-3 flex items-center justify-center gap-2.5" aria-hidden>
              <span className="h-px w-6" style={{ background: "color-mix(in srgb, var(--brand-contrast) 45%, transparent)" }} />
              <span className="w-1 h-1 rotate-45" style={{ background: "color-mix(in srgb, var(--brand-contrast) 60%, transparent)" }} />
              <span className="h-px w-6" style={{ background: "color-mix(in srgb, var(--brand-contrast) 45%, transparent)" }} />
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, var(--brand-contrast) 88%, transparent)" }}>
              {tableLabel}
            </p>
          </div>
        )}
      </header>

      {/* ── Sticky category nav — understated underline active state ─────────── */}
      {categories.length > 1 && (
        <nav
          className="sticky top-0 z-20 border-b"
          style={{ background: "color-mix(in srgb, var(--menu-paper) 90%, transparent)", borderColor: "var(--menu-border)", backdropFilter: "blur(10px)" }}
        >
          <div className="flex gap-1 overflow-x-auto px-4 scrollbar-none max-w-2xl mx-auto">
            {categories.map((c) => {
              const active = activeId === c.id;
              return (
                <button
                  key={c.id}
                  ref={(el) => { chipRefs.current[c.id] = el; }}
                  onClick={() => scrollTo(c.id)}
                  aria-current={active ? "true" : undefined}
                  className="relative whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.09em] px-3 py-3.5 transition-colors duration-200"
                  style={{ color: active ? "var(--menu-heading)" : "var(--menu-faint)" }}
                >
                  {c.name}
                  <span
                    className="absolute left-3 right-3 bottom-2 h-[2px] rounded-full transition-opacity duration-200"
                    style={{ background: "var(--brand)", opacity: active ? 1 : 0 }}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Menu body ───────────────────────────────────────────────────────── */}
      <div className="px-6 pt-9 pb-32 max-w-2xl mx-auto">
        {categories.map((cat, ci) => (
          <section
            key={cat.id}
            id={cat.id}
            ref={(el) => { sectionRefs.current[cat.id] = el; }}
            className={`scroll-mt-16 ${ci === 0 ? "" : "mt-12"}`}
          >
            {/* Centered tracked eyebrow with a small diamond ornament */}
            <div className="text-center mb-6">
              <h2
                className="font-serif text-[22px] leading-none"
                style={{ color: "var(--menu-heading)", fontWeight: 500, letterSpacing: "0.01em" }}
              >
                {cat.name}
              </h2>
              <div className="mt-3 flex items-center justify-center gap-2.5" aria-hidden>
                <span className="h-px w-8" style={{ background: "var(--menu-border)" }} />
                <span className="w-1 h-1 rotate-45" style={{ background: "var(--brand)" }} />
                <span className="h-px w-8" style={{ background: "var(--menu-border)" }} />
              </div>
            </div>

            {/* Airy separated rows on the paper background (no boxed card) */}
            <ul className="divide-y" style={{ borderColor: "var(--menu-border)" }}>
              {cat.items.map((it) => (
                <li key={it.id} className="py-5 first:pt-0 flex gap-4" style={{ borderColor: "var(--menu-border)" }}>
                  {it.imageUrl && (
                    <div
                      className="w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] flex-shrink-0 overflow-hidden"
                      style={{ borderRadius: "var(--menu-radius-sm)", background: "var(--menu-border)" }}
                    >
                      <img src={it.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Dish name + leader dots + price on one baseline */}
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-serif text-[17px] leading-snug break-words" style={{ color: "var(--menu-heading)", fontWeight: 500 }}>
                        {it.name}
                      </h3>
                      {it.price && (
                        <>
                          <span
                            className="flex-1 min-w-3 translate-y-[-3px] self-end"
                            style={{ borderBottom: "1.5px dotted var(--menu-leader)" }}
                            aria-hidden
                          />
                          <span className="text-[15px] whitespace-nowrap tabular-nums font-semibold" style={{ color: "var(--brand)" }}>
                            {it.price} lei
                          </span>
                        </>
                      )}
                    </div>
                    {it.description && (
                      <p className="text-[13px] mt-1.5 leading-relaxed line-clamp-3" style={{ color: "var(--menu-muted)" }}>
                        {it.description}
                      </p>
                    )}
                    {it.allergens.length > 0 && (
                      <p className="text-[11px] mt-2 uppercase tracking-[0.08em]" style={{ color: "var(--menu-faint)" }}>
                        {it.allergens.join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="text-center mt-14" style={{ color: "var(--menu-faint)" }}>
          <div className="flex items-center justify-center gap-2.5 mb-3" aria-hidden>
            <span className="h-px w-6" style={{ background: "var(--menu-border)" }} />
            <span className="w-1 h-1 rotate-45" style={{ background: "var(--menu-border)" }} />
            <span className="h-px w-6" style={{ background: "var(--menu-border)" }} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-medium">
            Meniu digital prin <span style={{ color: "var(--menu-muted)" }}>Din Brașov</span>
          </p>
        </footer>
      </div>
    </>
  );
}
