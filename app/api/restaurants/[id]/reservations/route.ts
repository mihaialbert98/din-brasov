/** Owner/waiter board — list upcoming reservations for a restaurant. */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { listUpcomingReservations } from "@/lib/reservations";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canServeRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }
  return NextResponse.json({ data: await listUpcomingReservations(id) });
}
