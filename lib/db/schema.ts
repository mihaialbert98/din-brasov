import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ─── NextAuth required tables ────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }), // set on email confirmation (or by Google OAuth)
  emailConfirmationToken: text("email_confirmation_token"), // single-use token for the confirmation link
  image: text("image"),
  password: text("password"),
  phone: text("phone"),
  role: text("role").notNull().default("user"), // user | staff | moderator | admin
  birthDate: timestamp("birth_date", { mode: "date" }), // Law 190/2018 Art.5 — consent age 16
  gdprConsentAt: timestamp("gdpr_consent_at", { mode: "date" }),
  marketingConsentAt: timestamp("marketing_consent_at", { mode: "date" }), // separate consent per purpose
  deletionRequestedAt: timestamp("deletion_requested_at", { mode: "date" }),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  bannedUntil: timestamp("banned_until", { mode: "date" }),
  freeListingsUsed: integer("free_listings_used").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ─── News ─────────────────────────────────────────────────────────────────────

export const newsItems = pgTable(
  "news_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(), // max 300 chars — enforced in API layer
    sourceUrl: text("source_url").notNull().unique(),
    sourceName: text("source_name").notNull(),
    author: text("author"),
    publishedAt: timestamp("published_at", { mode: "date" }),
    imageUrl: text("image_url"),
    category: text("category"), // Actualitate | Sport | Cultura | Business | Sanatate | Altele
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("draft"), // draft | published | rejected
    scrapedAt: timestamp("scraped_at", { mode: "date" }),
    reviewedBy: text("reviewed_by").references(() => users.id),
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("news_search_idx").on(t.searchVector),
    index("news_status_idx").on(t.status),
    index("news_published_at_idx").on(t.publishedAt),
  ]
);

// ─── Events ──────────────────────────────────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description").notNull(),
    slug: text("slug").notNull().unique(),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { mode: "date" }),
    locationName: text("location_name"),
    address: text("address"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    category: text("category"), // Cultural | Sport | Muzica | Food | Business | Educatie | Altele
    imageUrl: text("image_url"),
    organizerId: text("organizer_id").references(() => users.id),
    externalUrl: text("external_url"),
    isFree: boolean("is_free").default(true),
    price: text("price"),
    currency: text("currency").default("RON"),
    status: text("status").notNull().default("draft"), // draft | published | rejected
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("events_search_idx").on(t.searchVector),
    index("events_status_idx").on(t.status),
    index("events_starts_at_idx").on(t.startsAt),
  ]
);

// ─── Experiences ─────────────────────────────────────────────────────────────

export const experiences = pgTable(
  "experiences",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description").notNull(),
    slug: text("slug").notNull().unique(),
    category: text("category"), // Aventura | Sport | Cultura | Gastronomie | Natura | Altele
    imageUrl: text("image_url"),
    externalUrl: text("external_url").notNull(),
    organizerId: text("organizer_id").references(() => users.id),
    status: text("status").notNull().default("draft"), // draft | published | rejected
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("experiences_search_idx").on(t.searchVector),
    index("experiences_status_idx").on(t.status),
  ]
);

// ─── Places / Local businesses ────────────────────────────────────────────────

export const places = pgTable(
  "places",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description").notNull(),
    slug: text("slug").notNull().unique(),
    category: text("category"), // Restaurant | Cafenea | Magazin | Servicii | Sanatate | Altele
    address: text("address"),
    phone: text("phone"),
    website: text("website"),
    hoursJson: text("hours_json"), // JSON string
    imagesJson: text("images_json"), // JSON array of Cloudinary URLs
    latitude: text("latitude"),
    longitude: text("longitude"),
    submitterId: text("submitter_id").references(() => users.id),
    status: text("status").notNull().default("draft"), // draft | published | rejected
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("places_search_idx").on(t.searchVector),
    index("places_status_idx").on(t.status),
  ]
);

// ─── Marketplace listings ─────────────────────────────────────────────────────

export const listings = pgTable(
  "listings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    description: text("description").notNull(),
    slug: text("slug").notNull().unique(),
    price: text("price"),
    currency: text("currency").default("RON"),
    category: text("category").notNull(), // Electronice | Mobila | Haine | Auto | Imobiliare | Servicii | Joburi | Altele
    condition: text("condition").default("used"), // new | used | not_applicable
    imagesJson: text("images_json"), // JSON array, max 8 Cloudinary URLs
    location: text("location"),
    city: text("city").notNull().default("Brașov"), // future multi-city support
    sellerId: text("seller_id").references(() => users.id),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    status: text("status").notNull().default("active"), // active | sold | expired | removed | suspended
    expiresAt: timestamp("expires_at", { mode: "date" }),
    isBoosted: boolean("is_boosted").notNull().default(false),
    boostedUntil: timestamp("boosted_until", { mode: "date" }),
    isAssisted: boolean("is_assisted").default(false),
    staffOperatorId: text("staff_operator_id").references(() => users.id),
    staffConsentTicked: boolean("staff_consent_ticked").default(false),
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("listings_search_idx").on(t.searchVector),
    index("listings_status_idx").on(t.status),
    index("listings_expires_at_idx").on(t.expiresAt),
    index("listings_seller_idx").on(t.sellerId),
    index("listings_city_idx").on(t.city),
  ]
);

// ─── Conversations (in-app messaging) ────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id").notNull().references(() => listings.id),
    buyerId: text("buyer_id").notNull().references(() => users.id),
    sellerId: text("seller_id").notNull().references(() => users.id),
    status: text("status").notNull().default("active"), // active | archived | blocked
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_buyer_idx").on(t.buyerId),
    index("conversations_seller_idx").on(t.sellerId),
    index("conversations_listing_idx").on(t.listingId),
  ]
);

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id").notNull().references(() => conversations.id),
    senderId: text("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(), // max 2000 chars enforced in API
    hasUrl: boolean("has_url").notNull().default(false),
    status: text("status").notNull().default("delivered"), // delivered | flagged
    readAt: timestamp("read_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId),
    index("messages_sender_idx").on(t.senderId),
  ]
);

// ─── Phone reveals log ────────────────────────────────────────────────────────

export const phoneReveals = pgTable(
  "phone_reveals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id").notNull().references(() => listings.id),
    userId: text("user_id").references(() => users.id),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("phone_reveals_user_idx").on(t.userId),
    index("phone_reveals_listing_idx").on(t.listingId),
    index("phone_reveals_created_idx").on(t.createdAt),
  ]
);

// ─── Listing reports ──────────────────────────────────────────────────────────

export const listingReports = pgTable(
  "listing_reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id").notNull().references(() => listings.id),
    reporterId: text("reporter_id").references(() => users.id),
    ipHash: text("ip_hash"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("listing_reports_listing_idx").on(t.listingId)]
);

// ─── Admin audit log ──────────────────────────────────────────────────────────

export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  adminId: text("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(), // approve_news | reject_news | remove_listing | change_role | etc.
  entityType: text("entity_type").notNull(), // news_item | listing | event | place | user
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Assisted listing consent log ────────────────────────────────────────────
// Required to document verbal consent given by elderly callers.
// GDPR Art. 7(1): controller must demonstrate consent was obtained.
// GDPR Recital 32: oral consent is valid, but the burden of proof is on the controller.
// Retention: life of listing + 3 years (Romanian Civil Code limitation period).

export const assistedConsentLog = pgTable("assisted_consent_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  listingId: text("listing_id").notNull().references(() => listings.id),
  staffOperatorId: text("staff_operator_id").notNull().references(() => users.id),
  callerPhone: text("caller_phone").notNull(), // the phone used to call — for traceability
  callerName: text("caller_name"),
  consentScriptVersion: text("consent_script_version").notNull(), // version of script read to caller
  consentGivenAt: timestamp("consent_given_at", { mode: "date" }).notNull().defaultNow(),
  // Purposes explained to caller — stored as JSON array of purpose codes
  purposesExplainedJson: text("purposes_explained_json").notNull(),
  // e.g. ["publish_listing","display_contact_phone","platform_storage"]
  withdrawalInformed: boolean("withdrawal_informed").notNull().default(false),
  notes: text("notes"), // optional free-text notes from staff member
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Cookie consent log ───────────────────────────────────────────────────────
// Store consent records server-side per Law 506/2004 + ANSPDCP enforcement guidance.
// Retention: 13 months (re-consent required after 12 months per EDPB guidance).
// The burden of proof that consent was given is on the controller (GDPR Art. 7(1)).

export const cookieConsentLog = pgTable("cookie_consent_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Anonymous fingerprint — no PII, just enough to link to a session/browser
  sessionToken: text("session_token"),
  userId: text("user_id").references(() => users.id),
  consentLevel: text("consent_level").notNull(), // necessary | analytics | full | withdrawn
  bannerVersion: text("banner_version").notNull(), // version of the consent notice shown
  ipHash: text("ip_hash"), // hashed IP — not stored in plain text (data minimisation)
  userAgent: text("user_agent"),
  consentGivenAt: timestamp("consent_given_at", { mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(), // 13 months from consent
});

// ─── Newsletter subscribers ───────────────────────────────────────────────────
// GDPR-compliant: boxes default to false (consent = affirmative action, CJEU Planet49).
// Anonymous subscribers go through double opt-in (status: pending → active on verify).
// Account-based subscribers are pre-verified by their account.

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  wantsNews: boolean("wants_news").notNull().default(false),
  wantsEvents: boolean("wants_events").notNull().default(false),
  wantsPlaces: boolean("wants_places").notNull().default(false),
  status: text("status").notNull().default("pending"), // pending | active | unsubscribed
  verificationToken: text("verification_token"), // also serves as the unsubscribe token
  verifiedAt: timestamp("verified_at", { mode: "date" }),
  unsubscribedAt: timestamp("unsubscribed_at", { mode: "date" }),
  consentGivenAt: timestamp("consent_given_at", { mode: "date" }).notNull().defaultNow(),
  ipHash: text("ip_hash"), // hashed IP — data minimisation (Art. 5(1)(c))
  bannerVersion: text("banner_version"),
  lastSentAt: timestamp("last_sent_at", { mode: "date" }), // last digest send — double-send guard
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Newsletter campaigns ─────────────────────────────────────────────────────
// Archive of one-off custom emails (business events, new-venue announcements) sent
// to subscribers. Kept for accountability — who sent what, to whom, when.

export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  subject: text("subject").notNull(),
  heading: text("heading").notNull(),
  bodyHtml: text("body_html").notNull(), // sanitised HTML body
  imageUrl: text("image_url"),
  ctaLabel: text("cta_label"),
  ctaHref: text("cta_href"),
  audience: text("audience").notNull(), // news | events | places | all
  recipientCount: integer("recipient_count").notNull().default(0),
  sentBy: text("sent_by").notNull().references(() => users.id),
  sentAt: timestamp("sent_at", { mode: "date" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Listing favourites ───────────────────────────────────────────────────────

export const listingFavourites = pgTable(
  "listing_favourites",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    listingId: text("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.listingId] }),
    index("listing_favourites_listing_idx").on(t.listingId),
  ]
);

// ─── User reports ─────────────────────────────────────────────────────────────

export const userReports = pgTable(
  "user_reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    reportedUserId: text("reported_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
    listingId: text("listing_id").references(() => listings.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"), // pending | reviewed | dismissed
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("user_reports_reported_idx").on(t.reportedUserId),
    index("user_reports_status_idx").on(t.status),
  ]
);

// ─── Support conversations ────────────────────────────────────────────────────

export const supportConversations = pgTable(
  "support_conversations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignedTo: text("assigned_to").references(() => users.id),
    status: text("status").notNull().default("open"), // open | closed
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("support_conversations_user_idx").on(t.userId),
    index("support_conversations_assigned_idx").on(t.assignedTo),
    index("support_conversations_status_idx").on(t.status),
  ]
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id").notNull().references(() => supportConversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("support_messages_conv_idx").on(t.conversationId),
  ]
);

// ─── Payments (Netopia) ───────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    listingId: text("listing_id").references(() => listings.id, { onDelete: "set null" }),
    netopiaOrderId: text("netopia_order_id").notNull().unique(),
    amount: integer("amount").notNull(), // in bani (RON × 100)
    currency: text("currency").notNull().default("RON"),
    type: text("type").notNull(), // listing_creation | boost
    status: text("status").notNull().default("pending"), // pending | confirmed | failed
    // For listing_creation: pending listing data stored here until payment confirmed
    pendingListingJson: text("pending_listing_json"),
    // Boost duration in days (7 or 14)
    boostDays: integer("boost_days"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { mode: "date" }),
  },
  (t) => [
    index("payments_user_idx").on(t.userId),
    index("payments_listing_idx").on(t.listingId),
    index("payments_status_idx").on(t.status),
    index("payments_order_idx").on(t.netopiaOrderId),
  ]
);

// ─── Sponsors ─────────────────────────────────────────────────────────────────

export const sponsors = pgTable("sponsors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  tagline: text("tagline"),
  slotLocation: text("slot_location").notNull(), // homepage | events | anunturi
  activeUntil: timestamp("active_until", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const sponsorLeads = pgTable("sponsor_leads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  preferredSlot: text("preferred_slot"), // homepage | events | anunturi
  message: text("message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Scraper sync jobs ────────────────────────────────────────────────────────

export const syncJobs = pgTable("sync_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(), // scrape_news | expire_listings
  status: text("status").notNull().default("pending"), // pending | running | done | error
  startedAt: timestamp("started_at", { mode: "date" }),
  finishedAt: timestamp("finished_at", { mode: "date" }),
  error: text("error"),
  metaJson: text("meta_json"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type NewsItem = typeof newsItems.$inferSelect;
export type NewNewsItem = typeof newsItems.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Experience = typeof experiences.$inferSelect;
export type NewExperience = typeof experiences.$inferInsert;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type SyncJob = typeof syncJobs.$inferSelect;
export type AssistedConsentLog = typeof assistedConsentLog.$inferSelect;
export type CookieConsentLog = typeof cookieConsentLog.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewsletterCampaign = typeof newsletterCampaigns.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type PhoneReveal = typeof phoneReveals.$inferSelect;
export type ListingReport = typeof listingReports.$inferSelect;
export type ListingFavourite = typeof listingFavourites.$inferSelect;
export type UserReport = typeof userReports.$inferSelect;
export type SupportConversation = typeof supportConversations.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Sponsor = typeof sponsors.$inferSelect;
export type SponsorLead = typeof sponsorLeads.$inferSelect;
