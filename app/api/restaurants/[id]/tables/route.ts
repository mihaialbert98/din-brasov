/** Owner table management — add N tables at once, auto-labeled "Masa <next>…". */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";
import { addNumberedTables } from "@/lib/restaurant-tables";

const schema = z.object({ count: z.number().int().min(1).max(100) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canManageRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const created = await addNumberedTables(id, parsed.data.count);
  return NextResponse.json({ ok: true, created }, { status: 201 });
}
