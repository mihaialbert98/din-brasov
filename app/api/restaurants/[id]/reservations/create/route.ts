/** Owner/waiter — manually add a reservation (someone called). Confirmed on the spot. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { createManualReservation } from "@/lib/reservations";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(50),
  guestName: z.string().min(2).max(100),
  guestPhone: z.string().min(6).max(20),
  area: z.enum(["inside", "outside"]).optional(),
  note: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canServeRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const { force, ...input } = parsed.data;
  const result = await createManualReservation(id, input, !!force);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, overridable: result.overridable }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
