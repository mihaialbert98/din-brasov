/**
 * Waiter accepts a service request. The request is a transient live signal — once
 * accepted it is DELETED from the DB (no history kept). service_requests acts as a
 * queue of currently-open calls, not a log.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceRequests } from "@/lib/db/schema";
import { canServeRestaurant } from "@/lib/restaurant-permissions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id, reqId } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canServeRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  await db
    .delete(serviceRequests)
    .where(and(eq(serviceRequests.id, reqId), eq(serviceRequests.restaurantId, id)));

  return NextResponse.json({ ok: true });
}
