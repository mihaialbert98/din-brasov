import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { sql, eq, and, isNotNull, isNull, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, restaurants, reservations, users, newsletterSubscribers } from "@/lib/db/schema";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import Pagination from "@/components/ui/Pagination";
import AdminClientsManager, { type AdminClient } from "@/components/admin/AdminClientsManager";

const PER_PAGE = 20;

/**
 * Admin: a restaurant's clients — account-holders AND guests who left an email —
 * de-duplicated to one row per email, with visit count + last visit + newsletter
 * (email consent) status. From here an admin can select consented clients and send
 * them a promo email. Platform staff (admin/moderator) only.
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

  // Unified client list: account-holders (by userId) + guests who left an email
  // (by email), so opted-in accountless guests are reachable too. Everyone here has
  // an email; keyed by lower(email). Phone-only guests aren't emailable → excluded.
  const [accountRows, guestRows] = await Promise.all([
    db
      .select({
        email: users.email,
        name: users.name,
        phone: sql<string | null>`coalesce(${users.phone}, max(${reservations.guestPhone}))`,
        visits: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${reservations.date})`,
      })
      .from(reservations)
      .innerJoin(users, eq(reservations.userId, users.id))
      .where(and(eq(reservations.restaurantId, restaurant.id), isNotNull(reservations.userId)))
      .groupBy(users.id, users.name, users.email, users.phone),
    db
      .select({
        email: sql<string>`lower(${reservations.guestEmail})`,
        name: sql<string | null>`max(${reservations.guestName})`,
        phone: sql<string | null>`max(${reservations.guestPhone})`,
        visits: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${reservations.date})`,
      })
      .from(reservations)
      .where(and(eq(reservations.restaurantId, restaurant.id), isNull(reservations.userId), isNotNull(reservations.guestEmail)))
      .groupBy(sql`lower(${reservations.guestEmail})`),
  ]);

  // Merge; drop guests whose email already belongs to an account; newest first.
  const accountEmails = new Set(accountRows.map((r) => r.email.toLowerCase()));
  type Row = { key: string; name: string | null; email: string; phone: string | null; visits: number; lastVisit: string; isGuest: boolean };
  const merged: Row[] = [
    ...accountRows.map((r) => ({ key: r.email.toLowerCase(), name: r.name, email: r.email, phone: r.phone, visits: r.visits, lastVisit: r.lastVisit, isGuest: false })),
    ...guestRows
      .filter((r) => r.email && !accountEmails.has(r.email))
      .map((r) => ({ key: r.email, name: r.name, email: r.email, phone: r.phone, visits: r.visits, lastVisit: r.lastVisit, isGuest: true })),
  ].sort((a, b) => (a.lastVisit < b.lastVisit ? 1 : a.lastVisit > b.lastVisit ? -1 : 0));

  const total = merged.length;

  // Which client emails are active subscribers opted into LOCALURI → emailable flag +
  // total (matches the send gate: a restaurant promo only reaches localuri-consented).
  const allEmails = merged.map((r) => r.key);
  const subRows = allEmails.length
    ? await db
        .selectDistinct({ email: sql<string>`lower(${newsletterSubscribers.email})` })
        .from(newsletterSubscribers)
        .where(and(eq(newsletterSubscribers.status, "active"), eq(newsletterSubscribers.wantsPlaces, true), inArray(sql`lower(${newsletterSubscribers.email})`, allEmails)))
    : [];
  const subSet = new Set(subRows.map((s) => s.email));
  const subscribedTotal = subSet.size;

  const clients: AdminClient[] = merged
    .slice((page - 1) * PER_PAGE, page * PER_PAGE)
    .map((r) => ({ key: r.key, name: r.name, email: r.email, phone: r.phone, visits: r.visits, lastVisit: r.lastVisit, isGuest: r.isGuest, subscribed: subSet.has(r.key) }));

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
            Clienții care au rezervat aici — cu cont sau ca invitați cu email. Promoțiile se trimit doar celor abonați la newsletter (consimțământ GDPR).
          </p>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-gray-400 text-sm">Încă niciun client cu email pentru acest restaurant.</p>
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
