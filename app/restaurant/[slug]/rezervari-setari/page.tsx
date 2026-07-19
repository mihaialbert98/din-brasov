import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRestaurantBySlug, canManageRestaurant } from "@/lib/restaurant-permissions";
import { getReservationHours } from "@/lib/reservations";
import ReservationSettings from "@/components/restaurant/ReservationSettings";

/**
 * Reservations SETTINGS — enable, confirmation mode, hours + seat capacity.
 * Manager-only (canManageRestaurant): owners and platform admins. Waiters can't
 * reach this; they use the board only.
 */
export default async function RezervariSetariPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const role = (session.user as any)?.role as string | undefined;
  if (!(await canManageRestaurant(session.user.id, restaurant.id, role))) notFound();

  const [row] = await db
    .select({
      adminGrant: restaurants.reservationsEnabledByAdmin,
      ownerEnabled: restaurants.reservationsEnabledByOwner,
      confirmMode: restaurants.reservationConfirmMode,
      maxParty: restaurants.reservationMaxPartySize,
      turnMinutes: restaurants.reservationTurnMinutes,
      areasEnabled: restaurants.reservationAreasEnabled,
      showInLocaluri: restaurants.showInLocaluri,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);

  const hours = await getReservationHours(restaurant.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/restaurant/${slug}/rezervari`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden /> Înapoi la rezervări
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Setări rezervări</h1>
        <p className="text-sm text-gray-500">Configurează cum și când primești rezervări.</p>
      </div>

      {!row?.adminGrant ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          Funcția de rezervări nu este încă activată pentru acest restaurant. Cere activarea de la
          echipa Din Brașov.
        </div>
      ) : (
        <>
          {row.ownerEnabled && !row.showInLocaluri && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
              <p className="font-medium">Rezervările sunt activate, dar restaurantul nu apare încă public în Localuri.</p>
              <p className="mt-1 text-amber-800">
                Clienții nu văd butonul „Rezervă o masă” până nu activezi vizibilitatea publică. Mergi la{" "}
                <Link href={`/restaurant/${slug}/aspect`} className="font-semibold underline">
                  Setări meniu
                </Link>{" "}
                și pornește „Arată în Localuri”.
              </p>
            </div>
          )}
          <ReservationSettings
            restaurantId={restaurant.id}
            initialEnabled={row.ownerEnabled}
            initialMode={row.confirmMode === "auto" ? "auto" : "manual"}
            initialMaxParty={row.maxParty ?? 12}
            initialTurnMinutes={row.turnMinutes ?? 90}
            initialAreasEnabled={row.areasEnabled ?? false}
            initialHours={hours}
          />
        </>
      )}
    </div>
  );
}
