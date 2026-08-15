/**
 * Owner/waiter — the room as it stands for one date/time/party: which tables exist and
 * which are already held by an overlapping booking (and by whom). Feeds the optional
 * table picker on the board. Read-only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { floorTableStatus } from "@/lib/floor-plan";
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

  return NextResponse.json(
    await floorTableStatus(id, q.date, q.time, { partySize: q.partySize, exclude: q.exclude }),
  );
}
