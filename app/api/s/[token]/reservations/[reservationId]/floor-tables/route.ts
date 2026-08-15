/** Shared staff-board — set (or clear) a booking's tables, by staff token. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { setFloorTables } from "@/lib/floor-plan";

const schema = z.object({ tableIds: z.array(z.string()).max(20) });

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ token: string; reservationId: string }> },
) {
  const { token, reservationId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const result = await setFloorTables(restaurant.id, reservationId, parsed.data.tableIds);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, conflicts: result.conflicts }, { status: result.status });
  }
  return NextResponse.json({ ok: true, tableIds: result.ids });
}
