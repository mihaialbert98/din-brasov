import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { absoluteUrl } from "@/lib/seo";
import {
  getRestaurantBySlug,
  canManageRestaurant,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import TablesManager, { type TableData } from "@/components/restaurant/TablesManager";

export default async function MesePage({
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
  const isAdmin = isPlatformStaff(role);

  const tables = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.restaurantId, restaurant.id))
    .orderBy(asc(restaurantTables.createdAt));

  // The card image itself is composited server-side per table (see the /card route).
  const data: TableData[] = tables.map((t) => ({
    id: t.id,
    label: t.label,
    menuUrl: absoluteUrl(`/m/${t.qrToken}`),
    isActive: t.isActive,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mese & coduri QR</h1>
      <p className="text-sm text-gray-500 mb-6">
        {isAdmin
          ? "Fiecare masă are un card cu cod QR unic, în stil Din Brașov. Printează sau descarcă cardul și pune-l pe masă."
          : "Cardurile cu cod QR sunt tipărite de echipa Din Brașov. Poți dezactiva temporar o masă (ex: în reparație) — clienții nu vor putea chema ospătarul de la ea."}
      </p>
      <TablesManager
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        initialTables={data}
        isAdmin={isAdmin}
      />
    </div>
  );
}
