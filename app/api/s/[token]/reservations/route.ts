/** Shared staff-board — list upcoming reservations by the restaurant's staff token. */
import { NextResponse } from "next/server";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { listUpcomingReservations } from "@/lib/reservations";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });
  return NextResponse.json({ data: await listUpcomingReservations(restaurant.id) });
}
