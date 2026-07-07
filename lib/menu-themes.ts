/**
 * Customer-menu appearance system — single source of truth for the selectable
 * DESIGNS (layouts) and their curated color THEMES. Used by the settings UI, the
 * validation on the settings API, and the customer menu renderer.
 *
 * A design defines the layout (and whether photos are required); a theme is a
 * curated palette tuned for that design. Each theme resolves to CSS custom-property
 * values applied on the .menu-theme root — every menu component reads these tokens,
 * so nothing is hardcoded.
 */

export type MenuDesignId = "modern" | "elegant" | "compact";

/** CSS token overrides for a theme (all optional; defaults come from globals.css). */
export interface MenuThemeTokens {
  brand: string;
  brandContrast: string;
  paper: string; // page background
  surface: string; // cards / rows
  text: string; // primary text
  heading: string; // serif headings
  muted: string; // secondary text
  faint: string; // tertiary / metadata
  border: string; // hairlines
}

export interface MenuTheme {
  id: string;
  label: string;
  tokens: MenuThemeTokens;
}

export interface MenuDesign {
  id: MenuDesignId;
  label: string;
  description: string;
  photosRequired: boolean; // switching TO this design needs every item to have a photo
  themes: MenuTheme[];
}

// ── Designs + curated themes ──────────────────────────────────────────────────

export const MENU_DESIGNS: MenuDesign[] = [
  {
    id: "modern",
    label: "Modern",
    description: "Aspect cu fotografii mari, potrivit pentru meniuri vizuale.",
    photosRequired: true,
    themes: [
      {
        id: "coral",
        label: "Coral",
        tokens: {
          brand: "#e2513c", brandContrast: "#ffffff",
          paper: "#f7f6f4", surface: "#ffffff", text: "#1c1917",
          heading: "#1c1917", muted: "#6f6a66", faint: "#a7a19c", border: "#eceae7",
        },
      },
      {
        id: "emerald",
        label: "Smarald",
        tokens: {
          brand: "#0f9d76", brandContrast: "#ffffff",
          paper: "#f5f7f5", surface: "#ffffff", text: "#18211d",
          heading: "#18211d", muted: "#5f6b64", faint: "#9aa8a0", border: "#e6ebe7",
        },
      },
      {
        id: "indigo",
        label: "Indigo",
        tokens: {
          brand: "#4f46e5", brandContrast: "#ffffff",
          paper: "#f6f6fa", surface: "#ffffff", text: "#1b1b2b",
          heading: "#1b1b2b", muted: "#66667a", faint: "#a0a0b4", border: "#e8e8f0",
        },
      },
    ],
  },
  {
    id: "elegant",
    label: "Elegant",
    description: "Aspect rafinat, tipografic, în stil fine-dining (fără fotografii).",
    photosRequired: false,
    themes: [
      {
        id: "terracotta",
        label: "Terracotta",
        tokens: {
          brand: "#c0492a", brandContrast: "#ffffff",
          paper: "#faf7f2", surface: "#ffffff", text: "#2a2320",
          heading: "#2a2320", muted: "#7a6f68", faint: "#b0a69e", border: "#eae3da",
        },
      },
      {
        id: "forest",
        label: "Pădure",
        tokens: {
          brand: "#2f5d50", brandContrast: "#f4efe6",
          paper: "#f6f4ee", surface: "#fffdf9", text: "#24302b",
          heading: "#24302b", muted: "#6b7570", faint: "#a3aca7", border: "#e6e6dd",
        },
      },
      {
        id: "wine",
        label: "Vin",
        tokens: {
          brand: "#7a2e3a", brandContrast: "#f6ece8",
          paper: "#f8f3f1", surface: "#fffcfb", text: "#2c2321",
          heading: "#2c2321", muted: "#7c6f6c", faint: "#b3a6a3", border: "#ece2df",
        },
      },
    ],
  },
  {
    id: "compact",
    label: "Compact",
    description: "Listă densă, orientată pe text — ideală pentru meniuri mari.",
    photosRequired: false,
    themes: [
      {
        id: "charcoal",
        label: "Grafit",
        tokens: {
          brand: "#3f3f46", brandContrast: "#ffffff",
          paper: "#ffffff", surface: "#ffffff", text: "#18181b",
          heading: "#18181b", muted: "#6b6b73", faint: "#a1a1aa", border: "#eaeaee",
        },
      },
      {
        id: "navy",
        label: "Bleumarin",
        tokens: {
          brand: "#1e3a5f", brandContrast: "#ffffff",
          paper: "#ffffff", surface: "#ffffff", text: "#141b26",
          heading: "#141b26", muted: "#5f6a78", faint: "#9aa3b0", border: "#e7eaef",
        },
      },
      {
        id: "burgundy",
        label: "Bordo",
        tokens: {
          brand: "#8a2b3a", brandContrast: "#ffffff",
          paper: "#ffffff", surface: "#ffffff", text: "#1f1416",
          heading: "#1f1416", muted: "#6f5f62", faint: "#a99a9d", border: "#eee6e7",
        },
      },
    ],
  },
];

// ── Lookups + validation ──────────────────────────────────────────────────────

export const DEFAULT_DESIGN: MenuDesignId = "elegant";
export const DEFAULT_THEME = "terracotta";

export function getDesign(id: string | null | undefined): MenuDesign {
  return MENU_DESIGNS.find((d) => d.id === id) ?? MENU_DESIGNS.find((d) => d.id === DEFAULT_DESIGN)!;
}

/** Resolve a (design, theme) pair to a valid, existing combination. */
export function resolveTheme(designId: string | null | undefined, themeId: string | null | undefined): {
  design: MenuDesign;
  theme: MenuTheme;
} {
  const design = getDesign(designId);
  const theme = design.themes.find((t) => t.id === themeId) ?? design.themes[0];
  return { design, theme };
}

export function isValidDesign(id: string): id is MenuDesignId {
  return MENU_DESIGNS.some((d) => d.id === id);
}

export function isValidTheme(designId: string, themeId: string): boolean {
  return getDesign(designId).themes.some((t) => t.id === themeId);
}

/** CSS custom properties object for a theme — spread onto the menu root's style. */
export function themeStyle(theme: MenuTheme): Record<string, string> {
  const t = theme.tokens;
  return {
    "--brand": t.brand,
    "--brand-contrast": t.brandContrast,
    "--menu-paper": t.paper,
    "--menu-surface": t.surface,
    "--menu-text": t.text,
    "--menu-heading": t.heading,
    "--menu-muted": t.muted,
    "--menu-faint": t.faint,
    "--menu-border": t.border,
  };
}
