/** Owner/admin: manage the reservation table inventory (tables-capacity mode). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservationTables, reservationTableGroupMembers } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";

const createSchema = z.object({
  label: z.string().min(1, "Numele mesei este obligatoriu.").max(60),
  seats: z.number().int().min(1, "O masă are cel puțin 1 loc.").max(50),
  joinable: z.boolean().optional(),
  area: z.enum(["inside", "outside"]).nullable().optional(),
});

const patchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  seats: z.number().int().min(1).max(50).optional(),
  joinable: z.boolean().optional(),
  area: z.enum(["inside", "outside"]).nullable().optional(),
  isActive: z.boolean().optional(),
});

async function gate(id: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const g = await authorizeReservationSettings(session, role, id);
  return { session, role, g };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const data = await db
    .select()
    .from(reservationTables)
    .where(eq(reservationTables.restaurantId, id))
    .orderBy(asc(reservationTables.createdAt));
  return NextResponse.json({ data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
  const d = parsed.data;
  await db.insert(reservationTables).values({
    restaurantId: id,
    label: d.label.trim(),
    seats: d.seats,
    joinable: d.joinable ?? false,
    area: d.area ?? null,
  });
  await auditAdminReservationChange(session, role, id, "a adăugat o masă de rezervare");
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
  if (d.seats !== undefined) patch.seats = d.seats;
  if (d.joinable !== undefined) patch.joinable = d.joinable;
  if (d.area !== undefined) patch.area = d.area;
  if (d.isActive !== undefined) patch.isActive = d.isActive;

  await db
    .update(reservationTables)
    .set(patch)
    .where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, id)));
  // Master switch: a table that's no longer joinable can't belong to any group.
  if (d.joinable === false) {
    await db.delete(reservationTableGroupMembers).where(eq(reservationTableGroupMembers.tableId, tableId));
  }
  await auditAdminReservationChange(session, role, id, "a modificat o masă de rezervare");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const tableId = new URL(req.url).searchParams.get("tableId");
  if (!tableId) return NextResponse.json({ error: "Lipsește tableId." }, { status: 400 });

  await db
    .delete(reservationTables)
    .where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a șters o masă de rezervare");
  return NextResponse.json({ ok: true });
}
