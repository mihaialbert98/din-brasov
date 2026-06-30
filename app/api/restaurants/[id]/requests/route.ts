/** Waiter board — list pending service requests for a restaurant. Polled by the board UI. */
import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceRequests, restaurantTables } from "@/lib/db/schema";
import { canServeRestaurant } from "@/lib/restaurant-permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canServeRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      createdAt: serviceRequests.createdAt,
      tableLabel: restaurantTables.label,
    })
    .from(serviceRequests)
    .innerJoin(restaurantTables, eq(serviceRequests.tableId, restaurantTables.id))
    .where(eq(serviceRequests.restaurantId, id))
    .orderBy(asc(serviceRequests.createdAt));

  return NextResponse.json({ data: rows });
}
