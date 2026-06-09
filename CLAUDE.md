# Din Brașov

Platformă civică independentă pentru orașul Brașov, România. Știri, evenimente, localuri, anunțuri și mesagerie internă — pentru toți brașovenii, inclusiv cei care nu folosesc internetul (anunțuri asistate prin telefon).

Conectată paginii de Instagram [@din_brasov](https://www.instagram.com/din_brasov/).

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), React 19, TypeScript strict |
| Database | Neon (serverless Postgres, eu-central-1) via Drizzle ORM |
| Auth | NextAuth v5 + Drizzle adapter (credentials + Google OAuth, JWT strategy) |
| Image storage | Uploadthing (replaces Cloudinary — `UPLOADTHING_TOKEN`) |
| Email | Resend (transactional) |
| Scraper | Standalone Node.js/Playwright service on Railway (`scraper/`) |
| UI | Tailwind v4, Lucide icons |
| Deployment | Vercel (Next.js app) + Railway (scraper service) |

---

## Application Sections

| Route | Name | Description |
|---|---|---|
| `/stiri` | Știri | Admin/moderator-curated news — scraped + manually created |
| `/evenimente` | Evenimente | Events with Leaflet map, date/category filters |
| `/localuri` | Localuri | New and highlighted local businesses |
| `/anunturi` | Anunțuri | OLX-like marketplace; auth required to post |
| `/mesaje` | Mesaje | In-app messaging inbox between buyers and sellers |

Admin panel at `/admin` — role-gated.

---

## User Roles

| Role | Capabilities |
|---|---|
| `user` | Post/manage own listings, message sellers, view all public content |
| `staff` | Create assisted listings on behalf of elderly callers (phone support) |
| `moderator` | All staff capabilities + approve/reject news/events/places, suspend/restore listings, create news manually, view flagged messages |
| `admin` | Everything moderator does + permanent content deletion, user management, audit log |

Role stored in `users.role`, embedded in JWT token. Enforced in `proxy.ts` (middleware) and rechecked in admin layout and API routes.

---

## Project Structure

```
app/
  (public)/        Public-facing pages (Navbar + Footer + CookieBanner)
    page.tsx        Homepage: hero, 4 section teasers, assisted listing CTA
    stiri/          News list + detail
    evenimente/     Events list + detail
    localuri/       Places list + detail
    anunturi/       Marketplace list + detail + nou/ (post listing)
    despre/         About + GDPR privacy policy + cookie policy
  (auth)/          Auth-required pages (same Navbar + Footer)
    intra/          Sign in
    cont-nou/       Register
    profil/         User profile + my listings
    profil/stergere/ GDPR account deletion
    mesaje/         Inbox + conversation thread
  admin/           Admin/moderator panel
    page.tsx        Dashboard with counts
    stiri/          News review queue + recently published
    stiri/nou/      Manual news creation form (Uploadthing image upload)
    anunturi/       Listings table with filters, contact details, actions
    anunturi/[id]/  Listing detail with reports, seller info, actions
    anunturi/nou-asistat/  Assisted listing form (GDPR consent)
    evenimente/     Events moderation
    localuri/       Places moderation
    utilizatori/    User management (admin only)
  api/
    auth/[...nextauth]/   NextAuth handler
    uploadthing/          Uploadthing file router
    news/                 POST (create manual news)
    news/[id]/approve|reject
    listings/assisted/    POST (create assisted listing)
    listings/[id]/reveal-phone  Rate-limited phone reveal (auth required)
    listings/[id]/contact       Create conversation + first message
    listings/[id]/report        Report a listing
    conversations/              GET inbox
    conversations/[id]/messages GET + POST messages
    admin/listings/[id]/suspend|restore|remove
    events/[id]/approve|reject
    places/[id]/approve|reject
    users/me/             DELETE (GDPR account deletion)
    users/register/       POST (registration)
    consent/cookie/       POST (server-side consent logging)
    cron/scrape-news/     Triggers Railway scraper
    cron/expire-listings/ Expires listings + GDPR cleanup

components/
  navbar/           Navbar (RSC) — logo, nav, inbox badge, admin button, profile
  footer/           Footer — links, Instagram, assisted listing phone
  cookie-consent/   CookieBanner (client) — Law 506/2004 compliant
  marketplace/      RevealPhoneButton, ContactSellerButton, ReportButton
  shared/           Pagination, SearchBar, EmptyState

lib/
  db/index.ts       Lazy Neon/Drizzle singleton (Proxy pattern)
  db/schema.ts      All table definitions + exported types
  auth.ts           NextAuth v5 config
  uploadthing.ts    Uploadthing FileRouter (newsImage, listingImage, eventImage)
  uploadthing-client.ts  Client-side helpers (useUploadThing, UploadButton)
  gdpr.ts           requestUserDeletion(), anonymiseUserListings(), hardDeleteExpiredUsers()
  search.ts         searchNews/searchEvents/searchListings/searchPlaces (Postgres FTS)
  slugify.ts        Romanian diacritics-aware slug generation
  rate-limit.ts     Phone reveal + message rate limiting, URL scam detection
  email.ts          Resend wrapper — transactional emails
  utils.ts          cn(), formatDate(), formatPrice(), truncate()

scraper/            Standalone Railway Node.js service (Express + Playwright)
  src/index.ts      Express server: POST /scrape (CRON_SECRET protected)
  src/sources/      One file per news source (BaseScraper pattern)
  src/db.ts         Direct Neon client for inserting draft news items
  Dockerfile

scripts/
  seed.ts           Dev seed data (news, events, places, listings)
```

---

## Database Schema (key tables)

| Table | Key fields |
|---|---|
| `users` | id, email, name, password, role, birth_date, gdpr_consent_at, deletion_requested_at, deleted_at |
| `news_items` | title, excerpt(300), source_url, source_name, category, slug, status, image_url, search_vector |
| `events` | title, description, slug, starts_at, location_name, category, status, search_vector |
| `places` | name, description, slug, category, address, status, search_vector |
| `listings` | title, description, slug, price, category, city, contact_phone, contact_email, status, expires_at, is_assisted, staff_consent_ticked |
| `conversations` | listing_id, buyer_id, seller_id, status |
| `messages` | conversation_id, sender_id, body, has_url, status (delivered\|flagged), read_at |
| `phone_reveals` | listing_id, user_id, ip_hash — rate limit: 20/hour |
| `listing_reports` | listing_id, reporter_id, ip_hash, reason — 3 unique IPs → auto-suspend |
| `admin_audit_log` | admin_id, action, entity_type, entity_id — append-only |
| `assisted_consent_log` | listing_id, staff_operator_id, caller_phone, consent_script_version, purposes_explained_json |
| `cookie_consent_log` | user_id, consent_level, banner_version, ip_hash, expires_at |

All entities with text content: `search_vector tsvector` + GIN index, populated by DB trigger.

Status values: `draft` | `published` | `rejected` | `active` | `sold` | `expired` | `removed` | `suspended`

---

## Key Conventions

- **All user-facing text in Romanian** (ro-RO locale)
- `db` is a lazy Proxy singleton — import at module level, never instantiate inside functions
- Slugs: always server-side via `lib/slugify.ts:slugifyWithDate()` — never trust user input
- Images: uploaded via Uploadthing (`lib/uploadthing.ts`), URL stored in DB
- `listings.city` defaults to `"Brașov"` — future multi-city expansion ready
- Contact phone/email **never appears in HTML source** — revealed only via authenticated API call (`/api/listings/[id]/reveal-phone`)
- Messages containing URLs (http, https, t.me, wa.me) → `status: "flagged"`, never delivered to recipient
- Listings expire after 30 days; contact data nulled at expiry; hard-delete after 90 days
- All admin actions logged to `admin_audit_log`

---

## Anti-Scam System

| Layer | Mechanism |
|---|---|
| Phone scraping | Number hidden from HTML; requires auth + API call; rate-limited 20/hour |
| Mass messaging | 5 msg/day for new accounts (<7 days), 30/day for all accounts |
| Scam link detection | URL regex blocks messages with links before delivery |
| Bot form submission | Honeypot field + <2 second timing check |
| Fake listings | Report button → 3 unique IP reports → auto-suspend |
| Permanent removal | Admin-only action, logged to audit log |

---

## GDPR (Romanian Law 190/2018 + EU GDPR)

- **Digital consent age: 16** (Law 190/2018, Art. 5)
- **Account deletion**: `/profil/stergere` → `requestUserDeletion()` → soft-delete + anonymise listings immediately → hard-delete after 30 days (cron)
- **Listing contact data**: nulled at expiry (`nullContactDataOnExpiredListings()` in cron)
- **Assisted listings**: verbal consent valid (GDPR Recital 32) but documented in `assisted_consent_log` — script version, purposes, withdrawal informed (Art. 7(1) burden of proof)
- **Cookie consent**: Law 506/2004 compliant — "Refuz tot" equally visible as "Accept tot"; logged server-side in `cookie_consent_log`; 12-month validity
- **News scraping**: excerpt max 300 chars, source attribution mandatory, robots.txt checked, no full article text
- **Joint controller**: marketplace operator is joint controller with listing poster (CJEU C-492/23 Russmedia)
- **Breach notification**: 72 hours to ANSPDCP (Decision 128/2018)
- Privacy policy at `/despre#gdpr`, cookie policy at `/despre#cookies`

---

## Dev Commands

```bash
pnpm dev              # Start dev server (http://localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations against Neon
pnpm db:push          # Push schema (dev only)
pnpm db:studio        # Open Drizzle Studio
pnpm seed             # Seed dev database with mock data
pnpm scraper:dev      # Start scraper locally
```

---

## Environment Variables

```
DATABASE_URL                  Neon connection string (eu-central-1)
AUTH_SECRET                   NextAuth secret (32-byte hex)
AUTH_GOOGLE_ID                Google OAuth client ID
AUTH_GOOGLE_SECRET            Google OAuth client secret
NEXTAUTH_URL                  Full app URL (http://localhost:3000 in dev)
UPLOADTHING_TOKEN             Uploadthing API token (uploadthing.com)
RESEND_API_KEY                Resend email API key
CRON_SECRET                   Shared secret for /api/cron/* routes (32-byte hex)
SCRAPER_URL                   Railway scraper service URL
TEST_DATABASE_URL             Separate Neon branch for tests
```

---

## Uploadthing File Routes

Defined in `lib/uploadthing.ts`, served at `/api/uploadthing`:

| Route name | Max size | Max files | Auth |
|---|---|---|---|
| `newsImage` | 4MB | 1 | admin, moderator |
| `listingImage` | 4MB | 8 | any authenticated user |
| `eventImage` | 4MB | 1 | admin, moderator |

Client helpers in `lib/uploadthing-client.ts`: `useUploadThing`, `UploadButton`, `UploadDropzone`.

---

## Scraper Service (`scraper/`)

Standalone Express + Playwright Node.js app — deployed on Railway, NOT on Vercel (Playwright binary too large).

- Triggered by: `POST /scrape` with `Authorization: Bearer $CRON_SECRET`
- Called by Vercel cron at `app/api/cron/scrape-news/` (3× daily: 06:00, 12:00, 18:00)
- Sources in `scraper/src/sources/` — implement `BaseScraper.scrape(): Promise<ScrapedItem[]>`
- Items inserted as `status: "draft"` — moderator/admin reviews before publishing
- **Never store full article text** — excerpt max 300 chars (GDPR + EU copyright law)

---

## Agents

See `agents/` folder for AI agent system prompts:

- `agents/frontend.md` — RSC-first, accessibility (WCAG AA, 44px tap targets, 18px min font)
- `agents/backend.md` — Drizzle conventions, API route patterns, GDPR deletion cascade
- `agents/qa.md` — Vitest + Playwright E2E, axe-core, critical test scenarios
- `agents/security.md` — threat model, ANSPDCP enforcement priorities, audit log
- `agents/ui-ux.md` — brand palette (terracotta #c84b1e, sky blue #6bb5d4, cream #e8d9c5), component specs
