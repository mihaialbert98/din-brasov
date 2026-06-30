/** Waiter acknowledges (clears) a service request. */
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
    .update(serviceRequests)
    .set({ status: "acknowledged", acknowledgedBy: session.user.id, acknowledgedAt: new Date() })
    .where(and(eq(serviceRequests.id, reqId), eq(serviceRequests.restaurantId, id)));

  return NextResponse.json({ ok: true });
}
