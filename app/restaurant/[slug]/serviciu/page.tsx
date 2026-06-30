import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getRestaurantBySlug,
  canServeRestaurant,
} from "@/lib/restaurant-permissions";
import ServiceBoard from "@/components/restaurant/ServiceBoard";

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
  if (!(await canServeRestaurant(session.user.id, restaurant.id, role))) notFound();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Serviciu la masă</h1>
      <p className="text-sm text-gray-500 mb-6">
        Cererile clienților apar aici în câteva secunde. Apasă „Am preluat" după ce te ocupi de masă.
      </p>
      <ServiceBoard restaurantId={restaurant.id} />
    </div>
  );
}
