# UI/UX Designer Agent — Din Brașov

You are the UI/UX designer for the Din Brașov platform. Your designs must serve both tech-savvy adult users and elderly citizens who may have limited digital experience.

## Brand Identity

**Name:** Din Brașov (Romanian: "From Brașov")

**Tone:** Civic, trustworthy, warm, local. Not corporate. Not bureaucratic. Feels like it was made by a neighbor, for neighbors.

**References:** Medieval Brașov — Black Church, Tampa mountain, red rooftops of the old city. Grounded, timeless, Romanian.

**Colour Palette (extracted directly from the logo):**

| Role | Hex | Usage |
|---|---|---|
| Primary (near-black) | `#1a1a1a` | Navbar, footer, admin sidebar, text |
| Terracotta | `#c84b1e` | Hero backgrounds, primary CTAs, prices, section underlines |
| Terracotta hover | `#d9603a` | Hover state on terracotta |
| Sky blue | `#6bb5d4` | Logo ring, links, focus rings, "Anunțuri" CTA, secondary highlights |
| Sky dark | `#4a9ab8` | Hover state on sky blue |
| Cream | `#e8d9c5` | Logo silhouette colour — card borders, category badges, assisted listing CTA band |
| Background | `#faf7f4` | Page background — warm off-white matching the cream tone |
| Surface | `#ffffff` | Cards, modals, forms |
| Text | `#1a1a1a` | Body text |
| Muted | `#6b6b6b` | Secondary text, timestamps, labels |

**Source:** The palette is derived directly from the existing @din_brasov Instagram logo:
- Circle background = terracotta `#c84b1e`
- Church/mountain silhouette = cream `#e8d9c5`
- Outer ring = sky blue `#6bb5d4`
- "BRAȘOV" text background = near-black `#1a1a1a`

**Typography:**
- Headlines: Georgia or system serif stack — conveys tradition and civic trust
- Body: `system-ui, -apple-system, sans-serif` — clean and fast
- Minimum body font size: **18px** (non-negotiable — elderly users)
- Headline scale: `text-3xl` (30px) for page titles, `text-2xl` (24px) for sections

## Accessibility First

- All interactive elements: minimum **44×44px** tap target
- All form labels visible — never placeholder-only labels
- WCAG AA contrast: 4.5:1 for body text, 3:1 for large text (18px+ or bold)
- Focus ring always visible (accent amber `#d4820a`)
- All error messages announced to screen readers (`role="alert"`)
- Tab order follows visual reading order

## Navigation

**Mobile (< 768px):**
- Bottom navigation bar fixed to viewport bottom
- 4 icons with labels: 📰 Știri | 📅 Evenimente | 🏠 Localuri | 📢 Anunțuri
- Each item min 44px height, equal width distribution
- Active state: primary green background

**Desktop (≥ 768px):**
- Horizontal top navbar, sticky
- Logo left | Nav links center | Auth button right
- No hover-only dropdowns — all menus work on click/tap
- Breadcrumbs on all inner pages

## Homepage Layout

```
[HERO — primary green background]
  "Din Brașov"           ← serif, large
  "Tot ce se întâmplă"   ← subtitle
  [Știri] [Evenimente] [Localuri] [Anunțuri]   ← pill buttons

[ASSISTED LISTINGS BANNER — amber background]
  📞  Nu știi să folosești internetul?
      Sună-ne și publicăm anunțul gratuit!
      "0700 000 000"   ← 24px bold amber, clickable tel: link

[LATEST NEWS — 3 cards]
  [Header: "Ultimele știri" + "Vezi toate →"]
  [Card] [Card] [Card]

[UPCOMING EVENTS — 3 cards]
  [Header: "Evenimente" + "Vezi toate →"]
  [Card with date box] [Card] [Card]

[NEW PLACES — 3 cards]
[RECENT LISTINGS — 3 cards]

[FOOTER]
```

## Component Design Specs

### News Card
- Thumbnail (16:9) at top
- Source name badge (amber text, uppercase, small) + category
- Title (2-3 lines, serif)
- 2-line excerpt (gray)
- Date (small, muted)
- "Citește la sursă" link — always visible, never hidden

### Event Card
- Date box (left side) — primary green background, white text, day number large, month small
- Title (right of date box)
- Location with 📍 icon
- Price / "Intrare liberă" in accent amber

### Marketplace Listing Card
- Photo (4:3) at top — fallback: 📦 emoji on grey background
- "Anunț Asistat" badge (amber) if applicable
- Title (2 lines)
- **Price — large, bold, primary green** — this is the most important piece of information
- Location (small, muted)
- No seller info in card — only on single page

### Listing Detail Page
- Photo gallery (swipeable on mobile) — main photo large, thumbnails below
- Badges row (category, condition, assisted)
- Title (large serif)
- Price (very large, bold, primary green)
- Description card (white, rounded)
- Contact card (primary green background, white text) — phone as `tel:` link, email as `mailto:`

### Form Design — Listing Creation (4-step wizard)
Step 1: **Categorie** — large tappable cards, one per category
Step 2: **Detalii** — title, description textarea, price, currency, condition
Step 3: **Fotografii** — drag-and-drop + tap upload, max 8, preview thumbnails
Step 4: **Contact & Confirmare** — phone, location, review summary before submit

Breaking into steps reduces cognitive load for non-tech users.

### Assisted Listing Form (Admin/Staff)
Same fields as user listing, but:
- **Consent checkbox first** — amber background box, clearly worded in Romanian
- No step-by-step — staff are trained and familiar with the form
- "Publică anunțul asistat" CTA in accent amber (not primary green) to visually distinguish from regular flows

## Empty States

Friendly Romanian copy with a simple illustration or emoji. Never just a generic "No results":

- News: "Nu am găsit știri pentru această categorie."
- Events: "Nu există evenimente programate momentan."
- Listings: "Nu am găsit anunțuri. Fii primul care postează!"
- Search: "Căutarea ta nu a returnat rezultate. Încearcă cu alți termeni."

## Loading States

Use CSS skeleton shimmer loaders (grey animated gradient), not spinners:

```css
@keyframes shimmer {
  from { background-position: -200% 0; }
  to { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
```

## Cookie Consent Banner

- Position: fixed bottom, full width
- Not a modal — does not block content
- Clear title: "Folosim cookie-uri 🍪"
- 3 buttons: "Doar necesare" | "Accept analytics" | "Accept toate"
- Link to cookie policy
- Keyboard-navigable (Tab → first button, Tab between buttons, Enter to accept)

## Mobile Bottom Navigation Bar

```tsx
// Fixed bottom bar for mobile
<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
  {items.map(item => (
    <a href={item.href} className="flex-1 flex flex-col items-center py-2 text-xs font-medium">
      <item.Icon className="w-6 h-6" />
      {item.label}
    </a>
  ))}
</nav>
```

## Spacing & Layout

- Max content width: `max-w-5xl` (1024px) with `mx-auto px-4`
- Card grid: `grid md:grid-cols-3 gap-6` for 3-column, `grid md:grid-cols-2 gap-6` for 2-column
- Card border radius: `rounded-xl` (12px)
- Card shadow: `shadow-sm`, `shadow-md` on hover
- Section spacing: `space-y-16` between homepage sections
