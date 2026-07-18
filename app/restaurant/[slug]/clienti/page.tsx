import { notFound, redirect } from "next/navigation";
import { Phone, Users } from "lucide-react";
import { sql, eq, and, isNotNull, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservations, users, restaurantClientNotes } from "@/lib/db/schema";
import { getRestaurantBySlug, canManageRestaurant } from "@/lib/restaurant-permissions";
import { formatDate } from "@/lib/utils";
import ClientNote from "@/components/restaurant/ClientNote";
import ClientSearch from "@/components/restaurant/ClientSearch";
import Pagination from "@/components/ui/Pagination";

const PER_PAGE = 20;

/**
 * Restaurant CRM — the de-duplicated list of account-holding clients who have
 * reserved here (one row per user, regardless of how many bookings). Owner/admin
 * only. Shows the client's PHONE (email is hidden — the platform admin emails
 * clients), visit count, last visit, and an editable private note.
 */
export default async function ClientiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pagina?: string; q?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.pagina ?? "1"));
  const query = (sp.q ?? "").trim();
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const role = (session.user as any)?.role as string | undefined;
  if (!(await canManageRestaurant(session.user.id, restaurant.id, role))) notFound();

  const baseWhere = and(eq(reservations.restaurantId, restaurant.id), isNotNull(reservations.userId));

  // Single search box → matches a client's name OR any of their phone numbers
  // (the account phone or any booking's guest phone). Applied as HAVING because
  // the phone match spans aggregated guest_phone values.
  const having = query
    ? sql`(
        ${users.name} ilike ${"%" + query + "%"}
        or coalesce(${users.phone}, '') ilike ${"%" + query + "%"}
        or bool_or(${reservations.guestPhone} ilike ${"%" + query + "%"})
      )`
    : undefined;

  // Aggregate reservations by userId → one row per client. Phone falls back to the
  // most recent booking's guest phone when the account has none saved. A fresh
  // builder per use (Drizzle consumes a builder once it's turned into a subquery).
  const groupedClients = () =>
    db
      .select({
        userId: reservations.userId,
        name: users.name,
        phone: sql<string | null>`coalesce(${users.phone}, max(${reservations.guestPhone}))`,
        visits: sql<number>`count(*)::int`,
        lastVisit: sql<string>`max(${reservations.date})`,
        note: restaurantClientNotes.note,
      })
      .from(reservations)
      .innerJoin(users, eq(reservations.userId, users.id))
      .leftJoin(
        restaurantClientNotes,
        and(
          eq(restaurantClientNotes.restaurantId, restaurant.id),
          eq(restaurantClientNotes.userId, reservations.userId),
        ),
      )
      .where(baseWhere)
      .groupBy(reservations.userId, users.name, users.phone, restaurantClientNotes.note)
      .having(having);

  // Count matching client rows (one per user) by wrapping the grouped query.
  const countSub = groupedClients().as("client_rows");

  const [[{ total }], clients] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(countSub),
    groupedClients()
      .orderBy(desc(sql`max(${reservations.date})`))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clienți</h1>
        <p className="text-sm text-gray-500">
          Clienții cu cont care au rezervat la tine. Adaugă notițe private despre preferințele lor.
        </p>
      </div>

      <ClientSearch initialQuery={query} />

      {clients.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {query
            ? `Niciun client găsit pentru „${query}”.`
            : "Încă niciun client cu cont. Clienții apar aici după ce rezervă fiind conectați pe Din Brașov."}
        </p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {clients.map((c) => (
              <div key={c.userId} className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{c.name ?? "Client"}</p>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-sm text-gray-500 mt-0.5 hover:text-gray-800">
                        <Phone className="w-3.5 h-3.5" aria-hidden /> {c.phone}
                      </a>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-flex items-center gap-1 text-sm bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5">
                      <Users className="w-3.5 h-3.5" aria-hidden /> {c.visits} {c.visits === 1 ? "rezervare" : "rezervări"}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      ultima: {formatDate(new Date(`${c.lastVisit}T00:00:00`), { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <ClientNote restaurantId={restaurant.id} userId={c.userId!} initialNote={c.note ?? ""} />
                </div>
              </div>
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={(p) => {
              const qs = new URLSearchParams();
              if (query) qs.set("q", query);
              if (p > 1) qs.set("pagina", String(p));
              const s = qs.toString();
              return `/restaurant/${slug}/clienti${s ? `?${s}` : ""}`;
            }}
          />
        </>
      )}
    </div>
  );
}
