import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { reservations, restaurants, places } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/ui/Pagination";
import CancelReservationButton from "@/components/profil/CancelReservationButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rezervările mele" };

const PER_PAGE = 15;

export default async function ProfilRezervariPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");
  const userId = session.user.id;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.pagina ?? "1"));

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(reservations).where(eq(reservations.userId, userId)),
    db
      .select({
        id: reservations.id,
        date: reservations.date,
        time: reservations.time,
        partySize: reservations.partySize,
        status: reservations.status,
        area: reservations.area,
        restaurantName: restaurants.name,
        placeSlug: places.slug,
      })
      .from(reservations)
      .innerJoin(restaurants, eq(reservations.restaurantId, restaurants.id))
      .leftJoin(places, eq(restaurants.placeId, places.id))
      .where(eq(reservations.userId, userId))
      .orderBy(desc(reservations.date), desc(reservations.time))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full max-w-2xl">
      <Link href="/profil" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Înapoi la profil
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Rezervările mele ({total})</h1>

      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">Nu ai nicio rezervare.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {rows.map((r) => {
            const upcoming = r.date >= today && (r.status === "pending" || r.status === "confirmed");
            return (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{r.restaurantName}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(new Date(`${r.date}T00:00:00`), { weekday: "short", day: "numeric", month: "long", year: "numeric" })} · ora {r.time} · {r.partySize} pers.
                    {r.area ? ` · ${r.area === "inside" ? "interior" : "terasă"}` : ""}
                  </p>
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === "confirmed" ? "bg-green-100 text-green-800"
                    : r.status === "pending" ? "bg-amber-100 text-amber-800"
                    : r.status === "cancelled" ? "bg-gray-100 text-gray-500"
                    : "bg-red-100 text-red-700"
                  }`}>
                    {r.status === "confirmed" ? (upcoming ? "Confirmată" : "Onorată") : r.status === "pending" ? "În așteptare" : r.status === "cancelled" ? "Anulată" : "Refuzată"}
                  </span>
                </div>
                {upcoming && <CancelReservationButton reservationId={r.id} placeSlug={r.placeSlug} />}
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        buildHref={(p) => `/profil/rezervari${p > 1 ? `?pagina=${p}` : ""}`}
      />
    </div>
  );
}
