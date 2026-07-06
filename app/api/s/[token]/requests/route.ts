/**
 * Shared staff-board — list pending service requests by the restaurant's staff
 * token. No login: the unguessable token authorizes access (same model as the
 * diner menu token). Polled by the /s/[token] board.
 */
import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceRequests, restaurantTables } from "@/lib/db/schema";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const rows = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      paymentMethod: serviceRequests.paymentMethod,
      createdAt: serviceRequests.createdAt,
      tableLabel: restaurantTables.label,
    })
    .from(serviceRequests)
    .innerJoin(restaurantTables, eq(serviceRequests.tableId, restaurantTables.id))
    .where(eq(serviceRequests.restaurantId, restaurant.id))
    .orderBy(asc(serviceRequests.createdAt));

  return NextResponse.json({ data: rows });
}
