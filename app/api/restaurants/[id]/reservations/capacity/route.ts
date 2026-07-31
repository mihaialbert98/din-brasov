/**
 * Owner/waiter — live capacity preview for one date/time/party BEFORE saving a
 * manual reservation, so staff see how full the room is (and by how much a booking
 * would exceed it) instead of finding out from a rejection. Read-only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { slotCapacitySnapshot, type Area } from "@/lib/reservations";
import { parseCapacityQuery } from "@/lib/reservation-capacity-query";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canServeRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const q = parseCapacityQuery(req.url);
  if (!q) return NextResponse.json({ error: "Parametri invalizi." }, { status: 400 });

  const snapshot = await slotCapacitySnapshot(id, q.date, q.time, q.partySize, q.area as Area | undefined, q.exclude);
  return NextResponse.json(snapshot);
}
