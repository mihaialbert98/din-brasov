import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canServeRestaurant,
  canManageRestaurant,
} from "@/lib/restaurant-permissions";
import ReservationsBoard from "@/components/restaurant/ReservationsBoard";

/**
 * Reservations BOARD — see and manage bookings. Accessible to waiters too
 * (canServeRestaurant), so it's the day-to-day service surface. Settings live on
 * a separate manager-only page.
 */
export default async function RezervariPage({
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
  if (!(await canServeRestaurant(session.user.id, restaurant.id, role))) notFound();

  const [row] = await db
    .select({
      adminGrant: restaurants.reservationsEnabledByAdmin,
      ownerEnabled: restaurants.reservationsEnabledByOwner,
      confirmMode: restaurants.reservationConfirmMode,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);

  const isManager = await canManageRestaurant(session.user.id, restaurant.id, role);
  const enabled = !!row?.adminGrant && !!row?.ownerEnabled;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rezervări</h1>
          <p className="text-sm text-gray-500">Rezervările clienților apar aici. Confirmă sau refuză cererile.</p>
        </div>
        {isManager && (
          <Link
            href={`/restaurant/${slug}/rezervari-setari`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" aria-hidden /> Setări
          </Link>
        )}
      </div>

      {!enabled ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          {row?.adminGrant
            ? "Rezervările nu sunt activate. Un manager le poate activa din Setări."
            : "Funcția de rezervări nu este activată pentru acest restaurant. Cere activarea de la echipa Din Brașov."}
        </div>
      ) : (
        <ReservationsBoard basePath={`/api/restaurants/${restaurant.id}`} manualConfirm={row?.confirmMode !== "auto"} />
      )}
    </div>
  );
}
