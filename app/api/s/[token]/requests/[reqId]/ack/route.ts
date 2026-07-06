/**
 * Shared staff-board — accept (clear) a request via the staff token. Deletes the
 * transient row (queue of open calls, not a log), scoped to the token's restaurant.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceRequests } from "@/lib/db/schema";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string; reqId: string }> }
) {
  const { token, reqId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  await db
    .delete(serviceRequests)
    .where(and(eq(serviceRequests.id, reqId), eq(serviceRequests.restaurantId, restaurant.id)));

  return NextResponse.json({ ok: true });
}
