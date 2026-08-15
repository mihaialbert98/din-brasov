/** Owner/admin: the tables of the room for „Plan de sală”. No seat count — these record
 *  WHERE a booking sits, not how many fit (that's „Mese individuale”). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { floorTables } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";
import { bookingsAtFloorTable, detachFloorTable, resolveOwnSection } from "@/lib/floor-plan";

const createSchema = z.object({
  label: z.string().min(1, "Dă un nume mesei (ex: m1).").max(60),
  sectionId: z.string().nullable().optional(),
});

const patchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  sectionId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

async function gate(id: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  return { session, role, g: await authorizeReservationSettings(session, role, id) };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
  await db.insert(floorTables).values({
    restaurantId: id,
    label: parsed.data.label.trim(),
    sectionId: await resolveOwnSection(id, parsed.data.sectionId),
  });
  await auditAdminReservationChange(session, role, id, "a adăugat o masă în planul de sală");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const tableId = new URL(req.url).searchParams.get("tableId");
  if (!tableId) return NextResponse.json({ error: "Lipsește tableId." }, { status: 400 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.label !== undefined) patch.label = d.label.trim();
  if (d.sectionId !== undefined) patch.sectionId = await resolveOwnSection(id, d.sectionId);
  if (d.isActive !== undefined) patch.isActive = d.isActive;

  await db
    .update(floorTables)
    .set(patch)
    .where(and(eq(floorTables.id, tableId), eq(floorTables.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a modificat o masă din planul de sală");
  return NextResponse.json({ ok: true });
}

/**
 * Deleting a table never harms a booking — the floor plan is only a note about where
 * people sit, so the reservations themselves are untouched. But staff DID choose that
 * table for those guests, so the owner is shown which bookings lose their note before
 * confirming; `?force=true` then deletes and detaches. „Dezactivează” is offered first
 * as the reversible option, exactly like the „Mese individuale” inventory.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const url = new URL(req.url);
  const tableId = url.searchParams.get("tableId");
  if (!tableId) return NextResponse.json({ error: "Lipsește tableId." }, { status: 400 });
  const force = url.searchParams.get("force") === "true";

  const affected = await bookingsAtFloorTable(id, tableId);
  if (affected.length > 0 && !force) {
    return NextResponse.json(
      {
        error: `${affected.length} ${affected.length === 1 ? "rezervare viitoare este" : "rezervări viitoare sunt"} la această masă.`,
        needsConfirm: true,
        affected: affected.length,
        bookings: affected.slice(0, 10),
      },
      { status: 409 },
    );
  }

  const detached = await detachFloorTable(id, tableId);
  await db.delete(floorTables).where(and(eq(floorTables.id, tableId), eq(floorTables.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a șters o masă din planul de sală");
  return NextResponse.json({ ok: true, detached });
}
