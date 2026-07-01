/**
 * Table actions.
 *  - PATCH { action: "regenerate" } → new qrToken. PLATFORM-STAFF ONLY (printing/QR
 *    management is a Din Brașov job).
 *  - PATCH { action: "toggle", isActive } → enable/disable a table. Owner-allowed
 *    (restaurant admin can pause a table without touching QR/printing).
 *  - DELETE → remove a table. PLATFORM-STAFF ONLY.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { canManageRestaurant, isPlatformStaff } from "@/lib/restaurant-permissions";

/** Owner or platform-staff (manage). */
async function authorizeManage(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 as const };
  if (!(await canManageRestaurant(session.user.id, restaurantId, role))) {
    return { error: "Neautorizat", status: 403 as const };
  }
  return { userId: session.user.id, role };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params;
  const a = await authorizeManage(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));

  // Enable/disable — owner allowed.
  if (body?.action === "toggle") {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    const [updated] = await db
      .update(restaurantTables)
      .set({ isActive: parsed.data.isActive })
      .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)))
      .returning({ isActive: restaurantTables.isActive });
    if (!updated) return NextResponse.json({ error: "Masă negăsită." }, { status: 404 });
    return NextResponse.json({ ok: true, isActive: updated.isActive });
  }

  // Regenerate QR — platform-staff only (invalidates the printed code).
  if (body?.action === "regenerate") {
    if (!isPlatformStaff(a.role)) {
      return NextResponse.json({ error: "Doar echipa Din Brașov poate regenera codul QR." }, { status: 403 });
    }
    const [updated] = await db
      .update(restaurantTables)
      .set({ qrToken: crypto.randomUUID() })
      .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)))
      .returning({ qrToken: restaurantTables.qrToken });
    if (!updated) return NextResponse.json({ error: "Masă negăsită." }, { status: 404 });
    return NextResponse.json({ ok: true, qrToken: updated.qrToken });
  }

  return NextResponse.json({ error: "Acțiune invalidă." }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params;
  const a = await authorizeManage(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  // Deleting a table is platform-staff only.
  if (!isPlatformStaff(a.role)) {
    return NextResponse.json({ error: "Doar echipa Din Brașov poate șterge mese." }, { status: 403 });
  }

  await db
    .delete(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)));
  return NextResponse.json({ ok: true });
}
