/** Owner/admin: manage reservation join-groups — which tables can be pushed together. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservationTables, reservationTableGroups, reservationTableGroupMembers } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";

const createSchema = z.object({
  label: z.string().min(1, "Numele grupului este obligatoriu.").max(60),
  tableIds: z.array(z.string()).min(2, "Un grup are cel puțin 2 mese.").max(20),
});

const patchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  tableIds: z.array(z.string()).min(2).max(20).optional(),
});

async function gate(id: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const g = await authorizeReservationSettings(session, role, id);
  return { session, role, g };
}

/** Keep only ids that are JOINABLE reservation tables of THIS restaurant. Master
 *  switch: only "se poate uni" tables can be grouped. */
async function validTableIds(restaurantId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: reservationTables.id })
    .from(reservationTables)
    .where(and(eq(reservationTables.restaurantId, restaurantId), eq(reservationTables.joinable, true), inArray(reservationTables.id, ids)));
  return rows.map((r) => r.id);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const groups = await db
    .select()
    .from(reservationTableGroups)
    .where(eq(reservationTableGroups.restaurantId, id))
    .orderBy(asc(reservationTableGroups.createdAt));
  const members = groups.length
    ? await db
        .select({ groupId: reservationTableGroupMembers.groupId, tableId: reservationTableGroupMembers.tableId })
        .from(reservationTableGroupMembers)
        .where(inArray(reservationTableGroupMembers.groupId, groups.map((x) => x.id)))
    : [];
  const data = groups.map((grp) => ({
    id: grp.id,
    label: grp.label,
    tableIds: members.filter((m) => m.groupId === grp.id).map((m) => m.tableId),
  }));
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
  const validIds = await validTableIds(id, [...new Set(parsed.data.tableIds)]);
  if (validIds.length < 2) return NextResponse.json({ error: "Selectează cel puțin 2 mese care se pot uni." }, { status: 400 });

  const [grp] = await db
    .insert(reservationTableGroups)
    .values({ restaurantId: id, label: parsed.data.label.trim() })
    .returning({ id: reservationTableGroups.id });
  await db.insert(reservationTableGroupMembers).values(validIds.map((tableId) => ({ groupId: grp.id, tableId })));
  await auditAdminReservationChange(session, role, id, "a creat un grup de mese");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const groupId = new URL(req.url).searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "Lipsește groupId." }, { status: 400 });
  const [owned] = await db
    .select({ id: reservationTableGroups.id })
    .from(reservationTableGroups)
    .where(and(eq(reservationTableGroups.id, groupId), eq(reservationTableGroups.restaurantId, id)))
    .limit(1);
  if (!owned) return NextResponse.json({ error: "Grup negăsit." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
  if (parsed.data.label !== undefined) {
    await db.update(reservationTableGroups).set({ label: parsed.data.label.trim() }).where(eq(reservationTableGroups.id, groupId));
  }
  if (parsed.data.tableIds !== undefined) {
    const validIds = await validTableIds(id, [...new Set(parsed.data.tableIds)]);
    if (validIds.length < 2) return NextResponse.json({ error: "Un grup are cel puțin 2 mese care se pot uni." }, { status: 400 });
    // Replace membership.
    await db.delete(reservationTableGroupMembers).where(eq(reservationTableGroupMembers.groupId, groupId));
    await db.insert(reservationTableGroupMembers).values(validIds.map((tableId) => ({ groupId, tableId })));
  }
  await auditAdminReservationChange(session, role, id, "a modificat un grup de mese");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const groupId = new URL(req.url).searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "Lipsește groupId." }, { status: 400 });
  await db
    .delete(reservationTableGroups)
    .where(and(eq(reservationTableGroups.id, groupId), eq(reservationTableGroups.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a șters un grup de mese");
  return NextResponse.json({ ok: true });
}
