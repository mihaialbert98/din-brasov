/** Shared staff-board — „Schimbă masa” („Mese individuale”), by staff token. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantByStaffToken } from "@/lib/restaurant-permissions";
import { tableOptionsFor, setReservationTables } from "@/lib/table-override";

const schema = z.object({ tableIds: z.array(z.string()).min(1).max(10) });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; reservationId: string }> }) {
  const { token, reservationId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const data = await tableOptionsFor(restaurant.id, reservationId);
  if (!data) return NextResponse.json({ error: "Rezervare negăsită." }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string; reservationId: string }> }) {
  const { token, reservationId } = await params;
  const restaurant = await getRestaurantByStaffToken(token);
  if (!restaurant) return NextResponse.json({ error: "Negăsit" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Alege cel puțin o masă." }, { status: 400 });

  const result = await setReservationTables(restaurant.id, reservationId, parsed.data.tableIds);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true, tableIds: result.ids });
}
