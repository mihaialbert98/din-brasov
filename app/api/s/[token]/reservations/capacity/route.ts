/** Staff-link — live capacity preview via the staff token (no login). Read-only. */
import { NextResponse } from "next/server";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { slotCapacitySnapshot, type Area } from "@/lib/reservations";
import { parseCapacityQuery } from "@/lib/reservation-capacity-query";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const q = parseCapacityQuery(req.url);
  if (!q) return NextResponse.json({ error: "Parametri invalizi." }, { status: 400 });

  const snapshot = await slotCapacitySnapshot(restaurant.id, q.date, q.time, q.partySize, q.area as Area | undefined, q.exclude);
  return NextResponse.json(snapshot);
}
