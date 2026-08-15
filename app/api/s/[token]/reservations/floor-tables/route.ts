/** Shared staff-board — floor-plan availability for one date/time, by staff token. */
import { NextResponse } from "next/server";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { floorTableStatus } from "@/lib/floor-plan";
import { parseCapacityQuery } from "@/lib/reservation-capacity-query";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const q = parseCapacityQuery(req.url);
  if (!q) return NextResponse.json({ error: "Parametri invalizi." }, { status: 400 });

  return NextResponse.json(
    await floorTableStatus(restaurant.id, q.date, q.time, { partySize: q.partySize, exclude: q.exclude }),
  );
}
