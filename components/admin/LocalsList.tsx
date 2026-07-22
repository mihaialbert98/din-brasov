"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X as XIcon, ExternalLink, Utensils, CalendarCheck, MapPin, Users } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import ReservationsGrantButton from "@/components/admin/ReservationsGrantButton";
import EnableRestaurantButton from "@/components/admin/EnableRestaurantButton";
import AssignOwnerButton from "@/components/admin/AssignOwnerButton";

export interface LocalRow {
  id: string; // place id
  name: string;
  slug: string; // place slug
  category: string | null;
  status: string; // draft | published | rejected
  imageUrl: string | null;
  address: string | null;
  // Restaurant capability layer (null when directory-only).
  restaurantId: string | null;
  restaurantSlug: string | null;
  reservationsGranted: boolean;
  // Real public-booking readiness (not just the admin grant):
  //  bookable = a diner can reserve now; granted = admin on but owner setup missing;
  //  off = admin grant off.
  reservationState: "bookable" | "granted" | "off";
  ownerEmail: string | null;
  // Distinct account-holding clients who have reserved (0 when directory-only).
  clientCount: number;
}

function Badge({ on, label, icon: Icon }: { on: boolean; label: string; icon: React.ElementType }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        on ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-400"
      }`}
    >
      <Icon className="w-3 h-3" aria-hidden />
      {label}
      {on ? <Check className="w-3 h-3" aria-hidden /> : <XIcon className="w-3 h-3" aria-hidden />}
    </span>
  );
}

/**
 * Reservations badge with three states — the admin grant alone does NOT make a
 * restaurant bookable; the owner must also enable reservations and add hours.
 *  bookable → green (diner can reserve now); granted → amber (needs owner setup);
 *  off → gray (admin grant off).
 */
function ReservationBadge({ state }: { state: "bookable" | "granted" | "off" }) {
  const cfg =
    state === "bookable"
      ? { cls: "bg-green-100 text-green-800", label: "Rezervări", icon: <Check className="w-3 h-3" aria-hidden /> }
      : state === "granted"
      ? { cls: "bg-amber-100 text-amber-800", label: "Rezervări — de configurat", icon: null }
      : { cls: "bg-gray-100 text-gray-400", label: "Rezervări", icon: <XIcon className="w-3 h-3" aria-hidden /> };
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}
      title={
        state === "granted"
          ? "Acordat de admin, dar proprietarul nu a activat rezervările sau nu a adăugat program — clienții încă nu pot rezerva."
          : undefined
      }
    >
      <CalendarCheck className="w-3 h-3" aria-hidden />
      {cfg.label}
      {cfg.icon}
    </span>
  );
}

export default function LocalsList({ items }: { items: LocalRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/places/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConfirm(null);
      router.refresh();
    } catch {
      setError("Eroare la ștergere. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {confirm && (
        <ConfirmModal
          description={
            <>
              Ești sigur că vrei să ștergi <span className="font-semibold">„{confirm.name}”</span>? Acțiunea este ireversibilă.
            </>
          }
          loading={loading}
          error={error}
          onConfirm={() => del(confirm.id)}
          onCancel={() => { setConfirm(null); setError(null); }}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {items.map((l) => {
          const hasRestaurant = !!l.restaurantId;
          return (
            <div key={l.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-4">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300">
                    <MapPin className="w-5 h-5" aria-hidden />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/localuri/${l.slug}`} target="_blank" className="font-semibold text-gray-900 hover:underline">
                      {l.name}
                    </Link>
                    {l.category && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{l.category}</span>
                    )}
                    {l.status !== "published" && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        {l.status === "draft" ? "În așteptare" : "Respins"}
                      </span>
                    )}
                  </div>
                  {l.address && <p className="text-sm text-gray-500 mt-0.5">{l.address}</p>}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Badge on label="Local" icon={MapPin} />
                    <Badge on={hasRestaurant} label="Meniu" icon={Utensils} />
                    <ReservationBadge state={hasRestaurant ? l.reservationState : "off"} />
                    <span className="text-xs text-gray-400 ml-1">
                      {l.ownerEmail ? `owner: ${l.ownerEmail}` : "fără proprietar"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {hasRestaurant ? (
                  <>
                    <Link
                      href={`/restaurant/${l.restaurantSlug}`}
                      className="text-xs font-semibold px-3 h-11 rounded-lg bg-[#c84b1e] text-white hover:bg-[#d9603a] inline-flex items-center gap-1"
                    >
                      Panou restaurant <ExternalLink className="w-3 h-3" aria-hidden />
                    </Link>
                    <ReservationsGrantButton id={l.restaurantId!} granted={l.reservationsGranted} />
                    <Link
                      href={`/admin/localuri/${l.id}/clienti`}
                      className="text-xs font-semibold px-3 h-11 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
                    >
                      <Users className="w-3.5 h-3.5" aria-hidden /> Clienți ({l.clientCount})
                    </Link>
                    <AssignOwnerButton placeId={l.id} localName={l.name} currentOwnerEmail={l.ownerEmail} />
                  </>
                ) : (
                  <>
                    <EnableRestaurantButton placeId={l.id} />
                    <AssignOwnerButton placeId={l.id} localName={l.name} currentOwnerEmail={l.ownerEmail} />
                  </>
                )}
                <Link
                  href={`/admin/localuri/${l.id}`}
                  className="text-xs text-gray-600 border border-gray-300 px-3 h-11 inline-flex items-center rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Editează
                </Link>
                <button
                  onClick={() => setConfirm({ id: l.id, name: l.name })}
                  className="text-xs text-red-600 border border-red-200 px-3 h-11 inline-flex items-center rounded-lg hover:bg-red-50 transition-colors"
                >
                  Șterge
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
