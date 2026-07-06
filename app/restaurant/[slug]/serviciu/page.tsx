import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
  canEditMenuNow,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import { absoluteUrl } from "@/lib/seo";
import ServiceBoard from "@/components/restaurant/ServiceBoard";
import StaffLinkCard from "@/components/restaurant/StaffLinkCard";

export default async function ServiciuPage({
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
    .select({ staffToken: restaurants.staffToken })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);
  const staffUrl = absoluteUrl(`/s/${row!.staffToken}`);
  const staffQr = await QRCode.toDataURL(staffUrl, { width: 240, margin: 1, color: { dark: "#1a1a1a", light: "#ffffff" } });

  // Regenerate is a menu-level mutation → owner needs an active 2FA unlock; admin bypasses.
  const isAdmin = isPlatformStaff(role);
  const canRegenerate = isAdmin || (await canEditMenuNow(session.user.id, restaurant.id, role));

  return (
    <div className="max-w-2xl space-y-8">
      <StaffLinkCard
        restaurantId={restaurant.id}
        staffUrl={staffUrl}
        qrDataUrl={staffQr}
        canRegenerate={canRegenerate}
      />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Serviciu la masă</h1>
        <p className="text-sm text-gray-500 mb-6">
          Cererile clienților apar aici în câteva secunde. Apasă „Am preluat" după ce te ocupi de masă.
        </p>
        <ServiceBoard basePath={`/api/restaurants/${restaurant.id}`} />
      </div>
    </div>
  );
}
