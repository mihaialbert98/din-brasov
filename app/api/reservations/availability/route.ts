/**
 * Public: live available time slots for a restaurant on a given date + party size
 * (+ optional area). Full slots are omitted so the guest only sees bookable times.
 * When an area is given, also reports which of the day's slots have room in the
 * OTHER area (powers the "ai loc pe cealaltă zonă" hint).
 */
import { NextResponse } from "next/server";
import { canReserve, availableSlotsForDay, type Area } from "@/lib/reservations";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const date = url.searchParams.get("date");
  const partySize = Number(url.searchParams.get("partySize") ?? "2");
  const areaParam = url.searchParams.get("area");
  const area: Area | undefined = areaParam === "inside" || areaParam === "outside" ? areaParam : undefined;

  if (!restaurantId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || partySize < 1) {
    return NextResponse.json({ error: "Parametri invalizi." }, { status: 400 });
  }
  if (!(await canReserve(restaurantId))) {
    return NextResponse.json({ slots: [], otherAreaSlots: [] });
  }

  const slots = await availableSlotsForDay(restaurantId, date, partySize, area);

  // The other area's free slots (only when an area was requested) → for the hint.
  let otherAreaSlots: string[] = [];
  if (area) {
    const other: Area = area === "inside" ? "outside" : "inside";
    otherAreaSlots = await availableSlotsForDay(restaurantId, date, partySize, other);
  }

  return NextResponse.json({ slots, otherAreaSlots });
}
