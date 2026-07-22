import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { sql, eq, and, isNotNull, inArray, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, restaurants, reservations, users, newsletterSubscribers } from "@/lib/db/schema";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import Pagination from "@/components/ui/Pagination";
import AdminClientsManager, { type AdminClient } from "@/components/admin/AdminClientsManager";

const PER_PAGE = 20;

/**
 * Admin: a restaurant's clients (account holders who reserved here), de-duplicated to
 * one row per user with visit count + last visit + newsletter (email consent) status.
 * From here an admin can select consented clients and send them a promo email. Platform
 * staff (admin/moderator) only.
 */
export default async function AdminRestaurantClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { id } = await params; // place id (matches /admin/localuri/[id])
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.p ?? "1"));

  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) redirect("/intra");
  if (!isPlatformStaff(role)) notFound();

  // Resolve the restaurant behind this local.
  const [place] = await db.select({ id: places.id }).from(places).where(eq(places.id, id)).limit(1);
  if (!place) notFound();
  const [restaurant] = await db
    .select({ id: restaurants.id, name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.placeId, id))
    .limit(1);
  if (!restaurant) notFound();

  const baseWhere = and(eq(reservations.restaurantId, restaurant.id), isNotNull(reservations.userId));

  // One aggregated row per account-holding client (de-dup across bookings). Fresh
  // builder per use — Drizzle consumes a builder once it becomes a subquery.
  const grouped = () =>
    db
      .select({
        userId: reservations.userId,
        name: users.name,
        email: users.email,
        phone: sql<string | null>`coalesce(${users.phone}, max(${reservations.guestPhone}))`,
        visits: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${reservations.date})`,
      })
      .from(reservations)
      .innerJoin(users, eq(reservations.userId, users.id))
      .where(baseWhere)
      .groupBy(reservations.userId, users.name, users.email, users.phone);

  const countSub = grouped().as("client_rows");

  const [[{ total }], pageRows, [{ subscribedTotal }]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(countSub),
    grouped().orderBy(desc(sql`max(${reservations.date})`)).limit(PER_PAGE).offset((page - 1) * PER_PAGE),
    // Distinct consented clients of this restaurant (the emailable universe).
    db
      .select({ subscribedTotal: sql<number>`count(distinct ${newsletterSubscribers.userId})::int` })
      .from(newsletterSubscribers)
      .innerJoin(reservations, eq(reservations.userId, newsletterSubscribers.userId))
      .where(and(eq(reservations.restaurantId, restaurant.id), eq(newsletterSubscribers.status, "active"))),
  ]);

  // Which of THIS page's clients are active subscribers → emailable flag.
  const pageIds = pageRows.map((r) => r.userId!).filter(Boolean);
  const pageSubs = pageIds.length
    ? await db
        .selectDistinct({ userId: newsletterSubscribers.userId })
        .from(newsletterSubscribers)
        .where(and(inArray(newsletterSubscribers.userId, pageIds), eq(newsletterSubscribers.status, "active")))
    : [];
  const subSet = new Set(pageSubs.map((s) => s.userId));

  const clients: AdminClient[] = pageRows.map((r) => ({
    userId: r.userId!,
    name: r.name,
    email: r.email,
    phone: r.phone,
    visits: r.visits,
    lastVisit: r.lastVisit,
    subscribed: subSet.has(r.userId),
  }));

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/admin/localuri" className="text-gray-400 hover:text-gray-700 transition-colors mt-1">
          ← Înapoi
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienți — {restaurant.name}</h1>
          <p className="text-sm text-gray-500">
            Clienții cu cont care au rezervat aici. Promoțiile se trimit doar celor abonați la newsletter (consimțământ GDPR).
          </p>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-gray-400 text-sm">Încă niciun client cu cont pentru acest restaurant.</p>
      ) : (
        <>
          <AdminClientsManager
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            clients={clients}
            totalClients={total}
            subscribedTotal={subscribedTotal}
          />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={(p) => (p === 1 ? `/admin/localuri/${id}/clienti` : `/admin/localuri/${id}/clienti?p=${p}`)}
          />
        </>
      )}
    </div>
  );
}
