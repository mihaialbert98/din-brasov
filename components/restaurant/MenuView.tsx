"use client";

import { useEffect, useRef, useState } from "react";
import type { MenuDesignId } from "@/lib/menu-themes";

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
  design,
  restaurantName,
  tableLabel,
  logoUrl,
  coverUrl,
  categories,
}: {
  design: MenuDesignId;
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

  useEffect(() => {
    chipRefs.current[activeId]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  function scrollTo(id: string) {
    setActiveId(id);
    clickScrolling.current = true;
    const el = sectionRefs.current[id];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 78;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    window.setTimeout(() => { clickScrolling.current = false; }, 600);
  }

  const isElegant = design === "elegant";
  const isModern = design === "modern";
  const isCompact = design === "compact";

  return (
    <>
      {/* ── Hero (shared, tuned per design) ─────────────────────────────────── */}
      <Hero
        design={design}
        restaurantName={restaurantName}
        tableLabel={tableLabel}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
      />

      {/* ── Sticky category nav (shared) ────────────────────────────────────── */}
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
      <div className={`max-w-2xl mx-auto pb-32 ${isCompact ? "px-4 pt-6" : "px-6 pt-9"}`}>
        {categories.map((cat, ci) => (
          <section
            key={cat.id}
            id={cat.id}
            ref={(el) => { sectionRefs.current[cat.id] = el; }}
            className={`scroll-mt-16 ${ci === 0 ? "" : isCompact ? "mt-8" : "mt-12"}`}
          >
            <SectionHeading name={cat.name} design={design} />

            {isModern && <ModernList items={cat.items} />}
            {isElegant && <ElegantList items={cat.items} />}
            {isCompact && <CompactList items={cat.items} />}
          </section>
        ))}

        <Footer />
      </div>
    </>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function Hero({
  design,
  restaurantName,
  tableLabel,
  logoUrl,
  coverUrl,
}: {
  design: MenuDesignId;
  restaurantName: string;
  tableLabel: string;
  logoUrl: string | null;
  coverUrl?: string | null;
}) {
  const serif = design !== "compact"; // Compact uses the sans face for a cleaner, denser feel
  const nameClass = `${serif ? "font-serif font-medium" : "font-sans font-bold"} leading-tight`;

  // Cover photo hero for Modern (photo-forward) and Elegant (atmospheric, deeper
  // overlay + ornament). Compact stays on the slim brand band — density first.
  if (coverUrl && design !== "compact") {
    const elegant = design === "elegant";
    return (
      <header className="relative overflow-hidden">
        <div className={`relative ${elegant ? "h-60 sm:h-72" : "h-52 sm:h-60"}`}>
          <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div
            className={`absolute inset-0 bg-gradient-to-t ${
              elegant ? "from-black/80 via-black/40 to-black/15" : "from-black/75 via-black/30 to-transparent"
            }`}
          />
          <div className={`absolute inset-x-0 bottom-0 px-6 text-center ${elegant ? "pb-7" : "pb-6"}`}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className={`rounded-full object-cover mx-auto shadow-lg ${
                  elegant ? "w-[68px] h-[68px] mb-3 ring-1 ring-white/40" : "w-16 h-16 mb-3 ring-1 ring-white/50"
                }`}
              />
            )}
            <h1 className={`${nameClass} text-white text-[26px] sm:text-3xl [text-shadow:0_1px_10px_rgba(0,0,0,0.55)] px-2`}>
              {restaurantName}
            </h1>
            {elegant && (
              <div className="mt-3 flex items-center justify-center gap-2.5" aria-hidden>
                <span className="h-px w-6 bg-white/45" />
                <span className="w-1 h-1 rotate-45 bg-white/70" />
                <span className="h-px w-6 bg-white/45" />
              </div>
            )}
            <p className={`text-white/85 text-[11px] font-semibold uppercase tracking-[0.2em] ${elegant ? "mt-3" : "mt-2"}`}>
              {tableLabel}
            </p>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={`text-center ${design === "compact" ? "px-6 pt-8 pb-6" : "px-6 pt-11 pb-9"}`} style={{ background: "var(--brand)" }}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          className={`${design === "compact" ? "w-16 h-16 mb-3" : "w-[76px] h-[76px] mb-4"} rounded-full object-cover mx-auto shadow-md`}
          style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--brand-contrast) 45%, transparent)" }}
        />
      )}
      <h1 className={`${nameClass} text-[26px] sm:text-3xl`} style={{ color: "var(--brand-contrast)" }}>
        {restaurantName}
      </h1>
      {design === "elegant" && <Ornament onBrand />}
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${design === "elegant" ? "mt-3" : "mt-2"}`}
        style={{ color: "color-mix(in srgb, var(--brand-contrast) 88%, transparent)" }}
      >
        {tableLabel}
      </p>
    </header>
  );
}

// ── Section heading (per design) ──────────────────────────────────────────────

function SectionHeading({ name, design }: { name: string; design: MenuDesignId }) {
  if (design === "elegant") {
    return (
      <div className="text-center mb-6">
        <h2 className="font-serif text-[22px] leading-none" style={{ color: "var(--menu-heading)", fontWeight: 500, letterSpacing: "0.01em" }}>
          {name}
        </h2>
        <Ornament />
      </div>
    );
  }
  if (design === "compact") {
    return (
      <h2
        className="text-[13px] font-bold uppercase tracking-[0.12em] pb-2 mb-2 border-b"
        style={{ color: "var(--brand)", borderColor: "var(--menu-border)" }}
      >
        {name}
      </h2>
    );
  }
  // modern
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="font-serif font-bold text-[20px] tracking-tight" style={{ color: "var(--menu-heading)" }}>
        {name}
      </h2>
      <span className="h-px flex-1" style={{ background: "var(--menu-border)" }} />
    </div>
  );
}

// ── Modern: photo-forward cards ───────────────────────────────────────────────

function ModernList({ items }: { items: MenuViewItem[] }) {
  return (
    <ul
      className="rounded-2xl overflow-hidden divide-y"
      style={{ background: "var(--menu-surface)", boxShadow: "var(--menu-shadow)", borderColor: "var(--menu-border)" }}
    >
      {items.map((it) => (
        <li key={it.id} className="p-3.5 sm:p-4 flex gap-4" style={{ borderColor: "var(--menu-border)" }}>
          {it.imageUrl && (
            <div className="w-[88px] h-[88px] sm:w-24 sm:h-24 flex-shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--menu-border)" }}>
              <img src={it.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-[15px] leading-snug break-words" style={{ color: "var(--menu-heading)" }}>{it.name}</h3>
              {it.price && (
                <span className="font-bold text-[15px] whitespace-nowrap tabular-nums pl-1" style={{ color: "var(--brand)" }}>{it.price} lei</span>
              )}
            </div>
            {it.description && (
              <p className="text-[13px] mt-1 leading-relaxed line-clamp-3" style={{ color: "var(--menu-muted)" }}>{it.description}</p>
            )}
            <Allergens list={it.allergens} variant="chips" className="mt-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Elegant: airy rows, serif names, dotted price leaders ─────────────────────

function ElegantList({ items }: { items: MenuViewItem[] }) {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--menu-border)" }}>
      {items.map((it) => (
        <li key={it.id} className="py-5 first:pt-0" style={{ borderColor: "var(--menu-border)" }}>
          <div className="flex items-baseline gap-2">
            <h3 className="font-serif text-[17px] leading-snug break-words" style={{ color: "var(--menu-heading)", fontWeight: 500 }}>{it.name}</h3>
            {it.price && (
              <>
                <span className="flex-1 min-w-3 self-end translate-y-[-3px]" style={{ borderBottom: "1.5px dotted var(--menu-leader)" }} aria-hidden />
                <span className="text-[15px] whitespace-nowrap tabular-nums font-semibold" style={{ color: "var(--brand)" }}>{it.price} lei</span>
              </>
            )}
          </div>
          {it.description && (
            <p className="text-[13px] mt-1.5 leading-relaxed line-clamp-3" style={{ color: "var(--menu-muted)" }}>{it.description}</p>
          )}
          <Allergens list={it.allergens} variant="text" className="mt-2" />
        </li>
      ))}
    </ul>
  );
}

// ── Compact: dense text list, right-aligned prices ────────────────────────────

function CompactList({ items }: { items: MenuViewItem[] }) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.id} className="py-2.5 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <span className="font-semibold text-[14px]" style={{ color: "var(--menu-text)" }}>{it.name}</span>
            {it.description && (
              <span className="text-[13px] ml-2" style={{ color: "var(--menu-faint)" }}>{it.description}</span>
            )}
            <Allergens list={it.allergens} variant="text" className="mt-0.5" />
          </div>
          {it.price && (
            <span className="font-semibold text-[14px] whitespace-nowrap tabular-nums flex-shrink-0" style={{ color: "var(--brand)" }}>{it.price} lei</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function Allergens({ list, variant, className = "" }: { list: string[]; variant: "chips" | "text"; className?: string }) {
  if (list.length === 0) return null;
  if (variant === "chips") {
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {list.map((a) => (
          <span key={a} className="text-[11px] leading-none px-2 py-1 rounded-full" style={{ color: "var(--menu-muted)", background: "var(--menu-paper)" }}>{a}</span>
        ))}
      </div>
    );
  }
  return (
    <p className={`text-[11px] uppercase tracking-[0.08em] ${className}`} style={{ color: "var(--menu-faint)" }}>
      {list.join(" · ")}
    </p>
  );
}

function Ornament({ onBrand = false }: { onBrand?: boolean }) {
  const line = onBrand ? "color-mix(in srgb, var(--brand-contrast) 45%, transparent)" : "var(--menu-border)";
  const dot = onBrand ? "color-mix(in srgb, var(--brand-contrast) 60%, transparent)" : "var(--brand)";
  return (
    <div className="mt-3 flex items-center justify-center gap-2.5" aria-hidden>
      <span className="h-px w-8" style={{ background: line }} />
      <span className="w-1 h-1 rotate-45" style={{ background: dot }} />
      <span className="h-px w-8" style={{ background: line }} />
    </div>
  );
}

function Footer() {
  return (
    <footer className="text-center mt-14" style={{ color: "var(--menu-faint)" }}>
      <p className="text-[10px] uppercase tracking-[0.18em] font-medium">
        Meniu digital prin <span style={{ color: "var(--menu-muted)" }}>Din Brașov</span>
      </p>
    </footer>
  );
}
