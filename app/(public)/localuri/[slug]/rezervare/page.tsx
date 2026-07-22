import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq, and } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { restaurants, places, users, newsletterSubscribers } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { canReserve, getReservationHours, getMaxPartySize } from "@/lib/reservations";
import ReservationForm from "@/components/restaurant/ReservationForm";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getReservableRestaurant(slug);
  if (!data) return { title: "Rezervare indisponibilă" };
  return pageMetadata({
    title: `Rezervă o masă — ${data.place.name}`,
    description: `Rezervă o masă la ${data.place.name} din Brașov.`,
    path: `/localuri/${data.place.slug}/rezervare`,
    section: "Localuri",
  });
}

export default async function ReservationPage({ params }: Props) {
  const { slug } = await params;
  const data = await getReservableRestaurant(slug);
  if (!data) notFound();
  const { place, restaurant } = data;

  const hours = await getReservationHours(restaurant.id);
  const maxParty = await getMaxPartySize(restaurant.id);

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
      <Link
        href={`/localuri/${place.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Înapoi la {place.name}
      </Link>

      <h1 className="text-3xl font-semibold font-serif text-ink mb-2 leading-tight">Rezervă o masă</h1>
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
      />
    </div>
  );
}
