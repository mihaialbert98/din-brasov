import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  getRestaurantBySlug,
  getMembership,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import NavBadge from "@/components/restaurant/NavBadge";

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
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-56 bg-[#1a1a1a] text-white flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-white/10">
          <Link href="/" className="font-bold text-lg">
            Din <span className="text-[#c84b1e]">Brașov</span>
          </Link>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{restaurant.name}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
            >
              <span>{item.label}</span>
              {item.badge && <NavBadge basePath={apiBase} kind={item.badge} boardPath={item.href} />}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-gray-400">
          <p className="font-medium text-white truncate">{session.user?.name}</p>
          <p className="text-gray-400">
            {platform && !membership ? "Administrator" : "Proprietar"}
          </p>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
