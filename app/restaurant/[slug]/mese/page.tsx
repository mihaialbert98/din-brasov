import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { absoluteUrl } from "@/lib/seo";
import {
  getRestaurantBySlug,
  canManageRestaurant,
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

  const tables = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.restaurantId, restaurant.id))
    .orderBy(asc(restaurantTables.createdAt));

  // Pre-render each table's QR as a PNG data-URL (printable card).
  const data: TableData[] = await Promise.all(
    tables.map(async (t) => {
      const url = absoluteUrl(`/m/${t.qrToken}`);
      const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 });
      return { id: t.id, label: t.label, menuUrl: url, qrDataUrl };
    })
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mese & coduri QR</h1>
      <p className="text-sm text-gray-500 mb-6">
        Fiecare masă are un cod QR unic. Clienții îl scanează ca să vadă meniul și să cheme ospătarul.
        Printează cardul și pune-l pe masă.
      </p>
      <TablesManager
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        initialTables={data}
      />
    </div>
  );
}
