/**
 * Owner/waiter — „Schimbă masa” in „Mese individuale”: read the floor for this booking,
 * or move it onto chosen table(s). Separate from /floor-tables, which is the seats-mode
 * „Plan de sală” and has no size rules.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canServeRestaurant } from "@/lib/restaurant-permissions";
import { tableOptionsFor, setReservationTables } from "@/lib/table-override";

const schema = z.object({ tableIds: z.array(z.string()).min(1).max(10) });

async function gate(id: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 };
  if (!(await canServeRestaurant(session.user.id, id, role))) return { error: "Neautorizat", status: 403 };
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; reservationId: string }> }) {
  const { id, reservationId } = await params;
  const denied = await gate(id);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const data = await tableOptionsFor(id, reservationId);
  if (!data) return NextResponse.json({ error: "Rezervare negăsită." }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; reservationId: string }> }) {
  const { id, reservationId } = await params;
  const denied = await gate(id);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Alege cel puțin o masă." }, { status: 400 });

  const result = await setReservationTables(id, reservationId, parsed.data.tableIds);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true, tableIds: result.ids });
}
