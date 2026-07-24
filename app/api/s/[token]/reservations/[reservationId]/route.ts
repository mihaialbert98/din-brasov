/** Shared staff-board — edit a reservation's date / time / party size via staff token. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { updateReservation } from "@/lib/reservations";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(50),
  force: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string; reservationId: string }> }
) {
  const { token, reservationId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { date, time, partySize, force } = parsed.data;

  const result = await updateReservation(restaurant.id, reservationId, { date, time, partySize }, !!force);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, overridable: result.overridable }, { status: 400 });
  }
  return NextResponse.json({ ok: true, notifiableByEmail: result.notifiableByEmail });
}
