/** Shared staff-board — confirm / decline / cancel a reservation via staff token. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { setReservationStatus } from "@/lib/reservations";

const schema = z.object({ status: z.enum(["confirmed", "declined", "cancelled"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; reservationId: string }> }
) {
  const { token, reservationId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const ok = await setReservationStatus(restaurant.id, reservationId, parsed.data.status);
  if (!ok) return NextResponse.json({ error: "Rezervare negăsită." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
