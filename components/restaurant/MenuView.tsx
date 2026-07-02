"use client";

import { useEffect, useRef, useState } from "react";
import type { MenuDesignId } from "@/lib/menu-themes";

export type MenuLang = "ro" | "en";

export interface MenuViewItem {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  price: string | null;
  imageUrl: string | null;
  allergens: string; // free text (RO)
  allergensEn: string;
  calories: number | null;
}
export interface MenuViewCategory {
  id: string;
  name: string;
  nameEn: string | null;
  items: MenuViewItem[];
}

// ── Language helpers (EN falls back to RO when a translation is missing) ──────
const catName = (c: MenuViewCategory, lang: MenuLang) =>
  lang === "en" && c.nameEn ? c.nameEn : c.name;
const itemName = (it: MenuViewItem, lang: MenuLang) =>
  lang === "en" && it.nameEn ? it.nameEn : it.name;
const itemDesc = (it: MenuViewItem, lang: MenuLang) =>
  lang === "en" && it.descriptionEn ? it.descriptionEn : it.description;
const itemAllergens = (it: MenuViewItem, lang: MenuLang) =>
  lang === "en" && it.allergensEn ? it.allergensEn : it.allergens;

/** Metadata line: allergens + optional kcal, joined. */
function itemMeta(it: MenuViewItem, lang: MenuLang): string {
  const parts: string[] = [];
  const a = itemAllergens(it, lang);
  if (a) parts.push(a);
  if (it.calories != null) parts.push(`${it.calories} kcal`);
  return parts.join(" · ");
}

export default function MenuView({
  design,
  restaurantName,
  tableLabel,
  logoUrl,
  coverUrl,
  categories,
  lang,
  onLangChange,
}: {
  design: MenuDesignId;
  restaurantName: string;
  tableLabel: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  categories: MenuViewCategory[];
  lang: MenuLang;
  onLangChange: (l: MenuLang) => void;
}) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const [sheetItem, setSheetItem] = useState<MenuViewItem | null>(null);
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

  const isModern = design === "modern";
  const isElegant = design === "elegant";
  const isCompact = design === "compact";
  const open = (it: MenuViewItem) => setSheetItem(it);

  return (
    <>
      {/* ── Hero + language toggle ──────────────────────────────────────────── */}
      <div className="relative">
        <Hero
          design={design}
          restaurantName={restaurantName}
          tableLabel={tableLabel}
          logoUrl={logoUrl}
          coverUrl={coverUrl}
        />
        <div
          className="absolute top-3 right-3 z-10 flex rounded-full overflow-hidden backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.28)" }}
          role="group"
          aria-label="Limbă / Language"
        >
          {(["ro", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              aria-pressed={lang === l}
              className="px-2.5 h-8 text-[11px] font-bold uppercase tracking-wide transition-colors"
              style={
                lang === l
                  ? { background: "rgba(255,255,255,0.92)", color: "#1c1917", minHeight: "auto" }
                  : { color: "rgba(255,255,255,0.85)", minHeight: "auto" }
              }
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sticky category nav ─────────────────────────────────────────────── */}
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
                  {catName(c, lang)}
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
            <SectionHeading name={catName(cat, lang)} design={design} />
            {isModern && <ModernList items={cat.items} lang={lang} onOpen={open} />}
            {isElegant && <ElegantList items={cat.items} lang={lang} onOpen={open} />}
            {isCompact && <CompactList items={cat.items} lang={lang} onOpen={open} />}
          </section>
        ))}

        <footer className="text-center mt-14" style={{ color: "var(--menu-faint)" }}>
          <p className="text-[10px] uppercase tracking-[0.18em] font-medium">
            Meniu digital prin <span style={{ color: "var(--menu-muted)" }}>Din Brașov</span>
          </p>
        </footer>
      </div>

      {/* ── Item detail sheet ───────────────────────────────────────────────── */}
      {sheetItem && <ItemSheet item={sheetItem} lang={lang} onClose={() => setSheetItem(null)} />}
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
  const serif = design !== "compact";
  const nameClass = `${serif ? "font-serif font-medium" : "font-sans font-bold"} leading-tight`;

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

function ModernList({ items, lang, onOpen }: { items: MenuViewItem[]; lang: MenuLang; onOpen: (it: MenuViewItem) => void }) {
  return (
    <ul
      className="rounded-2xl overflow-hidden divide-y"
      style={{ background: "var(--menu-surface)", boxShadow: "var(--menu-shadow)", borderColor: "var(--menu-border)" }}
    >
      {items.map((it) => (
        <li key={it.id} style={{ borderColor: "var(--menu-border)" }}>
          <button
            onClick={() => onOpen(it)}
            className="w-full text-left p-3.5 sm:p-4 flex gap-4 transition-opacity active:opacity-70"
            style={{ minHeight: "auto" }}
          >
            {it.imageUrl && (
              <div className="w-[88px] h-[88px] sm:w-24 sm:h-24 flex-shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--menu-border)" }}>
                <img src={it.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-[15px] leading-snug break-words" style={{ color: "var(--menu-heading)" }}>{itemName(it, lang)}</h3>
                {it.price && (
                  <span className="font-bold text-[15px] whitespace-nowrap tabular-nums pl-1" style={{ color: "var(--brand)" }}>{it.price} lei</span>
                )}
              </div>
              {itemDesc(it, lang) && (
                <p className="text-[13px] mt-1 leading-relaxed line-clamp-3" style={{ color: "var(--menu-muted)" }}>{itemDesc(it, lang)}</p>
              )}
              {itemMeta(it, lang) && (
                <p className="text-[11px] mt-2" style={{ color: "var(--menu-faint)" }}>{itemMeta(it, lang)}</p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Elegant: airy rows, serif names, dotted price leaders ─────────────────────

function ElegantList({ items, lang, onOpen }: { items: MenuViewItem[]; lang: MenuLang; onOpen: (it: MenuViewItem) => void }) {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--menu-border)" }}>
      {items.map((it) => (
        <li key={it.id} style={{ borderColor: "var(--menu-border)" }}>
          <button
            onClick={() => onOpen(it)}
            className="w-full text-left py-5 first:pt-0 transition-opacity active:opacity-70"
            style={{ minHeight: "auto" }}
          >
            <div className="flex items-baseline gap-2">
              <h3 className="font-serif text-[17px] leading-snug break-words" style={{ color: "var(--menu-heading)", fontWeight: 500 }}>{itemName(it, lang)}</h3>
              {it.price && (
                <>
                  <span className="flex-1 min-w-3 self-end translate-y-[-3px]" style={{ borderBottom: "1.5px dotted var(--menu-leader)" }} aria-hidden />
                  <span className="text-[15px] whitespace-nowrap tabular-nums font-semibold" style={{ color: "var(--brand)" }}>{it.price} lei</span>
                </>
              )}
            </div>
            {itemDesc(it, lang) && (
              <p className="text-[13px] mt-1.5 leading-relaxed line-clamp-3" style={{ color: "var(--menu-muted)" }}>{itemDesc(it, lang)}</p>
            )}
            {itemMeta(it, lang) && (
              <p className="text-[11px] mt-2 uppercase tracking-[0.08em]" style={{ color: "var(--menu-faint)" }}>{itemMeta(it, lang)}</p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Compact: dense text list, right-aligned prices ────────────────────────────

function CompactList({ items, lang, onOpen }: { items: MenuViewItem[]; lang: MenuLang; onOpen: (it: MenuViewItem) => void }) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.id}>
          <button
            onClick={() => onOpen(it)}
            className="w-full text-left py-2.5 flex items-baseline justify-between gap-3 transition-opacity active:opacity-70"
            style={{ minHeight: "auto" }}
          >
            <span className="min-w-0">
              <span className="font-semibold text-[14px]" style={{ color: "var(--menu-text)" }}>{itemName(it, lang)}</span>
              {itemDesc(it, lang) && (
                <span className="text-[13px] ml-2" style={{ color: "var(--menu-faint)" }}>{itemDesc(it, lang)}</span>
              )}
            </span>
            {it.price && (
              <span className="font-semibold text-[14px] whitespace-nowrap tabular-nums flex-shrink-0" style={{ color: "var(--brand)" }}>{it.price} lei</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Item detail bottom sheet ──────────────────────────────────────────────────

function ItemSheet({ item, lang, onClose }: { item: MenuViewItem; lang: MenuLang; onClose: () => void }) {
  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const meta = itemMeta(item, lang);
  const t = (ro: string, en: string) => (lang === "en" ? en : ro);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={itemName(item, lang)}>
      <button className="absolute inset-0 bg-black/45 cursor-default" style={{ minHeight: "auto" }} onClick={onClose} aria-label={t("Închide", "Close")} />
      <div
        className="absolute bottom-0 inset-x-0 max-w-lg mx-auto rounded-t-3xl overflow-hidden shadow-2xl"
        style={{ background: "var(--menu-surface)", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {item.imageUrl ? (
          <div className="relative h-52 sm:h-60">
            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center bg-black/40 text-white backdrop-blur-sm"
              style={{ minHeight: "auto" }}
              aria-label={t("Închide", "Close")}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex justify-end pt-3 pr-3">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full grid place-items-center"
              style={{ minHeight: "auto", background: "var(--menu-paper)", color: "var(--menu-muted)" }}
              aria-label={t("Închide", "Close")}
            >
              ✕
            </button>
          </div>
        )}

        <div className="px-6 pt-5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-serif text-[20px] leading-snug" style={{ color: "var(--menu-heading)", fontWeight: 500 }}>
              {itemName(item, lang)}
            </h3>
            {item.price && (
              <span className="text-[17px] font-bold whitespace-nowrap tabular-nums" style={{ color: "var(--brand)" }}>
                {item.price} lei
              </span>
            )}
          </div>

          {itemDesc(item, lang) && (
            <p className="text-[14px] mt-3 leading-relaxed" style={{ color: "var(--menu-muted)" }}>
              {itemDesc(item, lang)}
            </p>
          )}

          {(meta || item.calories != null) && (
            <div className="mt-4 pt-4 border-t space-y-1.5" style={{ borderColor: "var(--menu-border)" }}>
              {itemAllergens(item, lang) && (
                <p className="text-[12px]" style={{ color: "var(--menu-faint)" }}>
                  <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: "var(--menu-muted)" }}>
                    {t("Alergeni", "Allergens")}:
                  </span>{" "}
                  {itemAllergens(item, lang)}
                </p>
              )}
              {item.calories != null && (
                <p className="text-[12px]" style={{ color: "var(--menu-faint)" }}>
                  <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: "var(--menu-muted)" }}>
                    {t("Calorii", "Calories")}:
                  </span>{" "}
                  {item.calories} kcal
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

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
