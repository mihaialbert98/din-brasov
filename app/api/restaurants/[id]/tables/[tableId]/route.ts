/** Delete a table, or regenerate its QR token (invalidates the printed code). */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 as const };
  const ok = await canManageRestaurant(session.user.id, restaurantId, role);
  if (!ok) return { error: "Neautorizat", status: 403 as const };
  return { userId: session.user.id };
}

// PATCH with { action: "regenerate" } → new qrToken (old printed QR stops working).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "regenerate") {
    return NextResponse.json({ error: "Acțiune invalidă." }, { status: 400 });
  }

  const [updated] = await db
    .update(restaurantTables)
    .set({ qrToken: crypto.randomUUID() })
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)))
    .returning({ qrToken: restaurantTables.qrToken });

  if (!updated) return NextResponse.json({ error: "Masă negăsită." }, { status: 404 });
  return NextResponse.json({ ok: true, qrToken: updated.qrToken });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  await db
    .delete(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)));
  return NextResponse.json({ ok: true });
}
