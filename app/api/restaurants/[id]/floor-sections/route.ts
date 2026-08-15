/** Owner/admin: sections of the room for „Plan de sală” („Sala 1”, „Terasă”, „Etaj”). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { floorSections } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";

const labelSchema = z.object({ label: z.string().min(1, "Dă un nume secțiunii.").max(60) });

async function gate(id: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  return { session, role, g: await authorizeReservationSettings(session, role, id) };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const parsed = labelSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
  await db.insert(floorSections).values({ restaurantId: id, label: parsed.data.label.trim() });
  await auditAdminReservationChange(session, role, id, "a adăugat o secțiune în planul de sală");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const sectionId = new URL(req.url).searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "Lipsește sectionId." }, { status: 400 });

  const parsed = labelSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
  await db
    .update(floorSections)
    .set({ label: parsed.data.label.trim() })
    .where(and(eq(floorSections.id, sectionId), eq(floorSections.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a redenumit o secțiune din planul de sală");
  return NextResponse.json({ ok: true });
}

/**
 * Deleting a section keeps its tables — the FK is ON DELETE SET NULL, so they land in
 * „Fără secțiune” with every booking assignment intact. Nothing to confirm: no reservation
 * can be harmed by this.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, role, g } = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const sectionId = new URL(req.url).searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "Lipsește sectionId." }, { status: 400 });

  await db.delete(floorSections).where(and(eq(floorSections.id, sectionId), eq(floorSections.restaurantId, id)));
  await auditAdminReservationChange(session, role, id, "a șters o secțiune din planul de sală");
  return NextResponse.json({ ok: true });
}
