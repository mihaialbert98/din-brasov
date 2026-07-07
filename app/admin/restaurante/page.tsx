import { db } from "@/lib/db";
import {
  restaurants,
  restaurantMembers,
  restaurantTables,
  users,
} from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import RestaurantStatusButton from "@/components/admin/RestaurantStatusButton";

export const metadata: Metadata = { title: "Admin — Restaurante" };

export default async function AdminRestaurantePage() {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      status: restaurants.status,
      createdAt: restaurants.createdAt,
    })
    .from(restaurants)
    .orderBy(desc(restaurants.createdAt));

  // Owner email + table count per restaurant (small dataset; simple per-row reads).
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const [[owner], [{ tableCount }]] = await Promise.all([
        db
          .select({ email: users.email, name: users.name })
          .from(restaurantMembers)
          .innerJoin(users, eq(restaurantMembers.userId, users.id))
          .where(
            and(
              eq(restaurantMembers.restaurantId, r.id),
              eq(restaurantMembers.memberRole, "owner")
            )
          )
          .limit(1),
        db
          .select({ tableCount: count() })
          .from(restaurantTables)
          .where(eq(restaurantTables.restaurantId, r.id)),
      ]);
      return { ...r, ownerEmail: owner?.email ?? "—", tableCount };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Restaurante ({rows.length})</h1>
        <Link
          href="/admin/restaurante/nou"
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#d9603a] transition-colors"
        >
          + Adaugă restaurant
        </Link>
      </div>

      {enriched.length === 0 ? (
        <p className="text-gray-500 text-sm">Niciun restaurant încă.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">Proprietar</th>
                <th className="px-4 py-3 font-medium">Mese</th>
                <th className="px-4 py-3 font-medium">Stare</th>
                <th className="px-4 py-3 font-medium text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {enriched.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/restaurant/${r.slug}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="text-xs text-gray-400">/{r.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.ownerEmail}</td>
                  <td className="px-4 py-3 text-gray-600">{r.tableCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {r.status === "active" ? "Activ" : "Suspendat"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RestaurantStatusButton id={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
