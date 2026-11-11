/** Shared staff-board — toggle „Rezervarea a sosit” via staff token. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { setReservationArrived } from "@/lib/reservations";

const schema = z.object({ arrived: z.boolean() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; reservationId: string }> }
) {
  const { token, reservationId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const ok = await setReservationArrived(restaurant.id, reservationId, parsed.data.arrived);
  if (!ok) return NextResponse.json({ error: "Rezervare negăsită sau neconfirmată." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
