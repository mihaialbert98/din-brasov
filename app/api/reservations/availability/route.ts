/**
 * Public: live available time slots for a restaurant on a given date + party size.
 * Full slots are omitted so the guest only ever sees bookable times.
 */
import { NextResponse } from "next/server";
import { canReserve, availableSlotsForDay } from "@/lib/reservations";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const date = url.searchParams.get("date");
  const partySize = Number(url.searchParams.get("partySize") ?? "2");

  if (!restaurantId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || partySize < 1) {
    return NextResponse.json({ error: "Parametri invalizi." }, { status: 400 });
  }
  if (!(await canReserve(restaurantId))) {
    return NextResponse.json({ slots: [] });
  }

  const slots = await availableSlotsForDay(restaurantId, date, partySize);
  return NextResponse.json({ slots });
}
