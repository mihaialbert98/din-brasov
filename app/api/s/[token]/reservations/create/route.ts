/** Staff-link — manually add a reservation via the staff token (no login). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { createManualReservation } from "@/lib/reservations";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(50),
  guestName: z.string().min(2).max(100),
  guestPhone: z.string().min(6).max(20),
  note: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const { force, ...input } = parsed.data;
  const result = await createManualReservation(restaurant.id, input, !!force);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, overridable: result.overridable }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
