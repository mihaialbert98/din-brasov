import { notFound } from "next/navigation";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import ServiceBoard from "@/components/restaurant/ServiceBoard";

// Live board — always fresh.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

/**
 * Shared staff service board, reachable by an unguessable staff link (no login).
 * The owner shares /s/{staffToken} with waiters; anyone with it sees the live
 * table requests and can accept them. Regenerating the token revokes old links.
 */
export default async function StaffBoardPage({ params }: Props) {
  const { token } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) notFound();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-[#1a1a1a] text-white px-5 py-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-gray-400">
            Din <span className="text-[#c84b1e] font-semibold">Brașov</span> · Serviciu
          </p>
          <h1 className="text-lg font-bold leading-tight">{restaurant.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-500 mb-5">
          Cererile clienților apar aici în câteva secunde. Apasă „Am preluat" după ce te ocupi de masă.
        </p>
        <ServiceBoard basePath={`/api/s/${token}`} />
      </main>
    </div>
  );
}
