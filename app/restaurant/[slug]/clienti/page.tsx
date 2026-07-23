import { notFound, redirect } from "next/navigation";
import { Phone, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { getRestaurantBySlug, canManageRestaurant } from "@/lib/restaurant-permissions";
import { listRestaurantClients } from "@/lib/reservations";
import { formatDate } from "@/lib/utils";
import ClientNote from "@/components/restaurant/ClientNote";
import ClientSearch from "@/components/restaurant/ClientSearch";
import Pagination from "@/components/ui/Pagination";

const PER_PAGE = 20;

/**
 * Restaurant CRM — every diner who has reserved here, so the owner can keep a
 * private note about each. Account-holders are keyed by their account (the note
 * follows them across bookings); accountless diners are keyed by phone (the note
 * follows that phone across bookings). Owner/admin only. Shows phone, visit count,
 * last visit and the editable note — email stays hidden (the platform admin emails).
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

  const { clients, totalPages } = await listRestaurantClients(restaurant.id, { query, page, perPage: PER_PAGE });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clienți</h1>
        <p className="text-sm text-gray-500">
          Toți clienții care au rezervat la tine — cu cont sau ca invitați. Adaugă notițe private despre preferințele lor.
        </p>
      </div>

      <ClientSearch initialQuery={query} />

      {clients.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {query
            ? `Niciun client găsit pentru „${query}”.`
            : "Încă niciun client. Clienții apar aici după ce rezervă la tine."}
        </p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {clients.map((c) => (
              <div key={c.isGuest ? `p:${c.phone}` : `u:${c.userId}`} className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {c.name ?? "Client"}
                      {c.isGuest && (
                        <span className="ml-2 align-middle text-[11px] font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                          fără cont
                        </span>
                      )}
                    </p>
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
                  <ClientNote
                    restaurantId={restaurant.id}
                    userId={c.isGuest ? undefined : c.userId ?? undefined}
                    phone={c.isGuest ? c.phone ?? undefined : undefined}
                    initialNote={c.note}
                  />
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
