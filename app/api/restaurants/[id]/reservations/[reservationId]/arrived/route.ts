/** Owner/waiter — toggle „Rezervarea a sosit” on a confirmed reservation. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { setReservationArrived } from "@/lib/reservations";

const schema = z.object({ arrived: z.boolean() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; reservationId: string }> }
) {
  const { id, reservationId } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canServeRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const ok = await setReservationArrived(id, reservationId, parsed.data.arrived);
  if (!ok) return NextResponse.json({ error: "Rezervare negăsită sau neconfirmată." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
