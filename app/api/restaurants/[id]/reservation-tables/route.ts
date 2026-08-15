/** Owner/admin: manage the reservation table inventory (tables-capacity mode). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reservationTables, reservationTableGroupMembers, restaurants, reservations } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange, backfillTableAssignments, bookingsSeatedAtTable } from "@/lib/reservations";

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
  // Held back for walk-ins / phone bookings: hidden from the public form, still
  // fully usable by staff. Unlike isActive, it never leaves a booking table-less.
  bookableOnline: z.boolean().optional(),
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
  // With zones on, a table MUST belong to one: availability filters per area, so an
  // area-less table would match neither and be unbookable. Default to the main room.
  const [rest] = await db
    .select({ areasEnabled: restaurants.reservationAreasEnabled })
    .from(restaurants)
    .where(eq(restaurants.id, id))
    .limit(1);
  const area = d.area ?? (rest?.areasEnabled ? "inside" : null);

  await db.insert(reservationTables).values({
    restaurantId: id,
    label: d.label.trim(),
    seats: d.seats,
    joinable: d.joinable ?? false,
    area,
  });
  await auditAdminReservationChange(session, role, id, "a adăugat o masă de rezervare");

  // A new table may finally seat future bookings that still hold none — e.g. the ones
  // carried over from "capacitate totală" (tables can only be added AFTER the switch,
  // so the switch itself had nothing to assign). Keeps occupancy honest as the owner
  // builds the room. Only attaches tables; never changes a booking otherwise.
  const backfill = await backfillTableAssignments(id);
  return NextResponse.json({ ok: true, assignedNow: backfill.assigned });
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

  // A terrace table can't be re-activated on its own while zones are off — the
  // "Interior & terasă" toggle is what reopens the terrace (it reactivates them all).
  if (d.isActive === true) {
    const [[tbl], [rest]] = await Promise.all([
      db.select({ area: reservationTables.area }).from(reservationTables)
        .where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, id))).limit(1),
      db.select({ areasEnabled: restaurants.reservationAreasEnabled }).from(restaurants)
        .where(eq(restaurants.id, id)).limit(1),
    ]);
    if (tbl?.area === "outside" && rest && !rest.areasEnabled) {
      return NextResponse.json(
        { error: "Masa este setată pentru terasă. Activează „Interior & terasă” ca să o folosești din nou." },
        { status: 409 },
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (d.label !== undefined) patch.label = d.label.trim();
  if (d.seats !== undefined) patch.seats = d.seats;
  if (d.joinable !== undefined) patch.joinable = d.joinable;
  if (d.area !== undefined) patch.area = d.area;
  if (d.isActive !== undefined) patch.isActive = d.isActive;
  if (d.bookableOnline !== undefined) patch.bookableOnline = d.bookableOnline;

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

  const url = new URL(req.url);
  const tableId = url.searchParams.get("tableId");
  if (!tableId) return NextResponse.json({ error: "Lipsește tableId." }, { status: 400 });
  const force = url.searchParams.get("force") === "true";

  // Deleting a table that future guests are seated at would leave them with no table
  // AND silently free the slot for someone else. Refuse until the owner confirms; the
  // UI offers "Dezactivează" (safe + reversible) as the primary alternative.
  const affected = await bookingsSeatedAtTable(id, tableId);
  const allTables = await db
    .select({ id: reservationTables.id })
    .from(reservationTables)
    .where(eq(reservationTables.restaurantId, id));
  const isLastTable = allTables.length <= 1;

  if (affected.length > 0 && !force) {
    return NextResponse.json(
      {
        error: `${affected.length} ${affected.length === 1 ? "rezervare viitoare este" : "rezervări viitoare sunt"} la această masă.`,
        needsConfirm: true,
        affected: affected.length,
        bookings: affected.slice(0, 10),
        isLastTable,
      },
      { status: 409 },
    );
  }

  // Clear the affected bookings first so the backfill can give each a fresh, complete
  // seating (instead of leaving a half-assignment behind), then drop the table.
  if (affected.length > 0) {
    await db
      .update(reservations)
      // The manual flag goes with the tables: whatever these bookings end up on next was
      // decided by the engine, not by staff. Cleared here too (not only in the backfill)
      // so a booking that can't be re-seated at all isn't left claiming a choice either.
      .set({ assignedTableIds: null, assignedTablesManual: false, updatedAt: new Date() })
      .where(inArray(reservations.id, affected.map((b) => b.id)));
  }
  await db
    .delete(reservationTables)
    .where(and(eq(reservationTables.id, tableId), eq(reservationTables.restaurantId, id)));

  // Re-seat whatever we can on the remaining tables; anything that can't be seated is
  // reported so the owner can call those guests.
  const report = await backfillTableAssignments(id);
  await auditAdminReservationChange(session, role, id, "a șters o masă de rezervare");
  return NextResponse.json({ ok: true, reassigned: report.assigned, unassigned: report.unassigned, isLastTable });
}
