import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq, and } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { restaurants, places, users, newsletterSubscribers } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { canReserve, getReservationHours, getMaxPartySize, getClosures, getReservationConfig } from "@/lib/reservations";
import ReservationForm from "@/components/restaurant/ReservationForm";
import { pageMetadata } from "@/lib/seo";
import { langFrom, strings, withLang } from "@/lib/i18n-reservation";
import LangToggle from "@/components/ui/LangToggle";

// `?lang=en` is read on the SERVER so the page's own chrome and the form agree from
// the first paint (no hydration flash), and so the choice survives navigation from
// the QR menu. pageMetadata() emits a canonical without query strings, so this adds
// no duplicate-content risk — see lib/seo.ts.
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
};

/** Published place slug → its active, reservation-enabled restaurant. */
async function getReservableRestaurant(slug: string) {
  const [place] = await db
    .select({ id: places.id, name: places.name, slug: places.slug, status: places.status })
    .from(places)
    .where(eq(places.slug, slug))
    .limit(1);
  if (!place || place.status !== "published") return null;

  const [restaurant] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      confirmMode: restaurants.reservationConfirmMode,
      areasEnabled: restaurants.reservationAreasEnabled,
      advanceDays: restaurants.reservationAdvanceDays,
    })
    .from(restaurants)
    .where(and(eq(restaurants.placeId, place.id), eq(restaurants.status, "active")))
    .limit(1);
  if (!restaurant) return null;
  if (!(await canReserve(restaurant.id))) return null;

  return { place, restaurant };
}

// Owners share these links on social media, so the preview card follows `?lang=en`
// too — an English link shouldn't preview in Romanian. `path` (and therefore the
// canonical and og:url) stays the clean Romanian URL, so both variants consolidate
// into one page for Google AND for Facebook/Instagram share counts.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lang = langFrom((await searchParams).lang);
  const data = await getReservableRestaurant(slug);
  if (!data) return { title: lang === "en" ? "Booking unavailable" : "Rezervare indisponibilă" };
  const name = data.place.name;
  return pageMetadata({
    title: lang === "en" ? `Book a table — ${name}` : `Rezervă o masă — ${name}`,
    description:
      lang === "en"
        ? `Book a table at ${name} in Brașov, Romania.`
        : `Rezervă o masă la ${name} din Brașov.`,
    path: `/localuri/${data.place.slug}/rezervare`,
    section: "Localuri",
    locale: lang === "en" ? "en_GB" : undefined,
  });
}

export default async function ReservationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const lang = langFrom((await searchParams).lang);
  const t = strings(lang);
  const data = await getReservableRestaurant(slug);
  if (!data) notFound();
  const { place, restaurant } = data;

  const hours = await getReservationHours(restaurant.id);
  const maxParty = await getMaxPartySize(restaurant.id);
  // Closed dates are dropped from the day picker; the duration config lets the form
  // name the stay length for the current party size without an extra request.
  const [closures, cfg] = await Promise.all([getClosures(restaurant.id), getReservationConfig(restaurant.id)]);

  // Pre-fill for logged-in members (convenience — never required). Also load
  // whether the account already saved a phone and whether they're a newsletter
  // subscriber (drives the "update phone" + "promo opt-in" controls).
  const session = await auth().catch(() => null);
  let prefill: { name?: string | null; phone?: string | null; email?: string | null } | undefined;
  let hasSavedPhone = false;
  let isSubscriber = false;
  if (session?.user?.id) {
    const [u] = await db
      .select({ name: users.name, phone: users.phone, email: users.email })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (u) {
      prefill = { name: u.name, phone: u.phone, email: u.email };
      hasSavedPhone = !!u.phone;
      const [sub] = await db
        .select({ id: newsletterSubscribers.id })
        .from(newsletterSubscribers)
        .where(and(eq(newsletterSubscribers.email, u.email), eq(newsletterSubscribers.status, "active")))
        .limit(1);
      isSubscriber = !!sub;
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          href={withLang(`/localuri/${place.slug}`, lang)}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {t.backTo(place.name)}
        </Link>
        <LangToggle lang={lang} path={`/localuri/${place.slug}/rezervare`} />
      </div>

      <h1 className="text-3xl font-semibold font-serif text-ink mb-2 leading-tight">{t.bookATable}</h1>
      <p className="text-muted mb-6">{place.name}</p>

      <ReservationForm
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        hours={hours}
        confirmMode={restaurant.confirmMode === "auto" ? "auto" : "manual"}
        maxParty={maxParty}
        areasEnabled={restaurant.areasEnabled}
        prefill={prefill}
        isMember={!!session?.user?.id}
        hasSavedPhone={hasSavedPhone}
        isSubscriber={isSubscriber}
        advanceDays={restaurant.advanceDays ?? 60}
        closures={closures.map((c) => ({ dateFrom: c.dateFrom, dateTo: c.dateTo }))}
        duration={{ show: cfg.showDuration, turn: cfg.turn, longTurn: cfg.longTurn }}
        successCopy={{ showEmailNotice: cfg.showEmailNotice }}
        lang={lang}
      />
    </div>
  );
}
