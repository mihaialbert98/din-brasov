import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRestaurantBySlug, canManageRestaurant } from "@/lib/restaurant-permissions";
import { getFloorSections, getFloorTables } from "@/lib/floor-plan";
import FloorPlanManager from "@/components/restaurant/FloorPlanManager";

/**
 * „Plan de sală” — the physical room: tables grouped into the owner's own sections.
 * Manager-only, like the other settings. Used purely to record where a booking sits;
 * it never changes what the public form offers.
 */
export default async function PlanSalaPage({ params }: { params: Promise<{ slug: string }> }) {
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
      capacityMode: restaurants.reservationCapacityMode,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);

  const [sections, tables] = await Promise.all([
    getFloorSections(restaurant.id),
    getFloorTables(restaurant.id),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/restaurant/${slug}/rezervari`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden /> Înapoi la rezervări
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Plan de sală</h1>
        <p className="text-sm text-gray-500">
          Mesele tale, grupate pe secțiuni — ca să știi cine unde stă.
        </p>
      </div>

      {!row?.adminGrant ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          Funcția de rezervări nu este încă activată pentru acest restaurant. Cere activarea de la
          echipa Din Brașov.
        </div>
      ) : row.capacityMode === "tables" ? (
        // In „Mese individuale” the engine already picks real tables by itself and shows
        // them on the booking card. A second, hand-made table list would be a second
        // source of truth for the same thing, so it isn't offered there.
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-900 space-y-2">
          <p className="font-medium">Restaurantul tău folosește „Mese individuale”.</p>
          <p>
            În acest mod mesele sunt deja atribuite automat fiecărei rezervări, după numărul de
            locuri — le vezi pe fișa rezervării, în tab-ul „Rezervări”. Planul de sală este pentru
            restaurantele pe „Capacitate totală”, care vor să noteze manual cine unde stă.
          </p>
          <p>
            Mesele le configurezi din{" "}
            <Link href={`/restaurant/${slug}/rezervari-setari`} className="font-semibold underline">
              Setări rezervări
            </Link>
            .
          </p>
        </div>
      ) : (
        <FloorPlanManager
          restaurantId={restaurant.id}
          initialSections={sections}
          initialTables={tables}
        />
      )}
    </div>
  );
}
