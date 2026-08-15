/**
 * Owner/waiter — set (or clear) which tables a booking sits at. Optional throughout:
 * an empty list is a valid, successful save, and no booking ever has to have one.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { setFloorTables } from "@/lib/floor-plan";

const schema = z.object({ tableIds: z.array(z.string()).max(20) });

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; reservationId: string }> },
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

  const result = await setFloorTables(id, reservationId, parsed.data.tableIds);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, conflicts: result.conflicts }, { status: result.status });
  }
  return NextResponse.json({ ok: true, tableIds: result.ids });
}
