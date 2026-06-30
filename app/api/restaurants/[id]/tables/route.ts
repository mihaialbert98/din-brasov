/** Owner table management — add a table (mints a unique QR token). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";

const schema = z.object({ label: z.string().min(1).max(50) });

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 as const };
  const ok = await canManageRestaurant(session.user.id, restaurantId, role);
  if (!ok) return { error: "Neautorizat", status: 403 as const };
  return { userId: session.user.id };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const [created] = await db
    .insert(restaurantTables)
    .values({ restaurantId: id, label: parsed.data.label.trim() })
    .returning({ id: restaurantTables.id, qrToken: restaurantTables.qrToken });

  return NextResponse.json({ ok: true, ...created }, { status: 201 });
}
