import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import {
  getRestaurantBySlug,
  getMembership,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import RestaurantShell from "@/components/restaurant/RestaurantShell";

/**
 * Per-restaurant gate + nav. Access requires a membership row (owner|waiter) for
 * this restaurant, OR platform staff (admin/moderator oversight). Owners see the
 * full management nav; waiters see only the service board.
 */
export default async function RestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const role = (session.user as any)?.role as string | undefined;
  const membership = await getMembership(session.user.id, restaurant.id);
  const platform = isPlatformStaff(role);

  // Access is owner (membership) or platform staff (admin/moderator oversight).
  const canManage = platform || membership?.memberRole === "owner";
  if (!canManage) notFound();

  const apiBase = `/api/restaurants/${restaurant.id}`;
  const nav: { href: string; label: string; badge?: "service" | "reservations" }[] = [
    { href: `/restaurant/${slug}`, label: "Prezentare" },
    { href: `/restaurant/${slug}/meniu`, label: "Meniu" },
    { href: `/restaurant/${slug}/aspect`, label: "Setări meniu" },
    { href: `/restaurant/${slug}/mese`, label: "Mese & QR" },
    { href: `/restaurant/${slug}/serviciu`, label: "Serviciu", badge: "service" },
    { href: `/restaurant/${slug}/rezervari`, label: "Rezervări", badge: "reservations" },
    { href: `/restaurant/${slug}/rezervari-setari`, label: "Setări rezervări" },
    { href: `/restaurant/${slug}/clienti`, label: "Clienți" },
    { href: `/restaurant/${slug}/personal`, label: "Membri echipă" },
  ];

  return (
    <RestaurantShell
      navItems={nav}
      apiBase={apiBase}
      restaurantName={restaurant.name}
      userName={session.user?.name ?? "Cont"}
      roleLabel={platform && !membership ? "Administrator" : "Proprietar"}
    >
      {children}
    </RestaurantShell>
  );
}
