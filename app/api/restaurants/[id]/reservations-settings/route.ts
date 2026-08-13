/**
 * Owner: enable/disable taking reservations + choose the confirmation mode.
 * Requires the admin grant to already be on (else enabling is refused). Gated by
 * authorizeMenuEdit (owner + 2FA unlock, or platform admin) like appearance.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, reservationHours, reservationTables } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange, backfillTableAssignments, type TableBackfillReport } from "@/lib/reservations";

const schema = z.object({
  enabled: z.boolean().optional(),
  confirmMode: z.enum(["auto", "manual"]).optional(),
  maxPartySize: z.number().int().min(1).max(50).optional(),
  areasEnabled: z.boolean().optional(),
  // Turn time — how long a booking occupies its seats (minutes). 30 min – 6 h.
  turnMinutes: z.number().int().min(30).max(360).optional(),
  // Longer turn for large parties, plus the shorter-stay fallback when the extra
  // minutes are the only thing blocking a slot.
  longTurnEnabled: z.boolean().optional(),
  longTurnFromParty: z.number().int().min(2).max(50).optional(),
  longTurnMinutes: z.number().int().min(30).max(360).optional(),
  allowReducedTurn: z.boolean().optional(),
  // Show the guest how long the table is held (booking form + success screen).
  showDuration: z.boolean().optional(),
  // Auto-confirm only: mention the confirmation email on the success screen.
  showEmailNotice: z.boolean().optional(),
  // Capacity model + its knobs.
  capacityMode: z.enum(["seats", "tables"]).optional(),
  maxJoin: z.number().int().min(1).max(6).optional(),
  advanceDays: z.number().int().min(1).max(365).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  const gate = await authorizeReservationSettings(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const [restaurant] = await db
    .select({
      adminGrant: restaurants.reservationsEnabledByAdmin,
      capacityMode: restaurants.reservationCapacityMode,
      areasEnabled: restaurants.reservationAreasEnabled,
    })
    .from(restaurants)
    .where(eq(restaurants.id, id))
    .limit(1);
  if (!restaurant) return NextResponse.json({ error: "Restaurant negăsit." }, { status: 404 });

  // Can't enable owner-side unless the platform granted the capability.
  if (parsed.data.enabled === true && !restaurant.adminGrant) {
    return NextResponse.json(
      { error: "Funcția de rezervări nu este activată de echipa Din Brașov pentru acest restaurant." },
      { status: 403 }
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.enabled !== undefined) patch.reservationsEnabledByOwner = parsed.data.enabled;
  if (parsed.data.confirmMode !== undefined) patch.reservationConfirmMode = parsed.data.confirmMode;
  if (parsed.data.maxPartySize !== undefined) patch.reservationMaxPartySize = parsed.data.maxPartySize;
  if (parsed.data.areasEnabled !== undefined) patch.reservationAreasEnabled = parsed.data.areasEnabled;
  if (parsed.data.turnMinutes !== undefined) patch.reservationTurnMinutes = parsed.data.turnMinutes;
  if (parsed.data.longTurnEnabled !== undefined) patch.reservationLongTurnEnabled = parsed.data.longTurnEnabled;
  if (parsed.data.longTurnFromParty !== undefined) patch.reservationLongTurnFromParty = parsed.data.longTurnFromParty;
  if (parsed.data.longTurnMinutes !== undefined) patch.reservationLongTurnMinutes = parsed.data.longTurnMinutes;
  if (parsed.data.allowReducedTurn !== undefined) patch.reservationAllowReducedTurn = parsed.data.allowReducedTurn;
  if (parsed.data.showDuration !== undefined) patch.reservationShowDuration = parsed.data.showDuration;
  if (parsed.data.showEmailNotice !== undefined) patch.reservationShowEmailNotice = parsed.data.showEmailNotice;
  if (parsed.data.capacityMode !== undefined) patch.reservationCapacityMode = parsed.data.capacityMode;
  if (parsed.data.maxJoin !== undefined) patch.reservationMaxJoin = parsed.data.maxJoin;
  if (parsed.data.advanceDays !== undefined) patch.reservationAdvanceDays = parsed.data.advanceDays;

  await db.update(restaurants).set(patch).where(eq(restaurants.id, id));

  // When areas are turned ON, backfill any existing window that has no per-area
  // seats yet by splitting its single capacity ~60% interior / 40% terrace — so
  // booking works immediately (the owner can fine-tune afterwards).
  if (parsed.data.areasEnabled === true) {
    await db
      .update(reservationHours)
      .set({
        seatsInside: sql`CEIL(${reservationHours.seatsPerSlot} * 0.6)`,
        seatsOutside: sql`${reservationHours.seatsPerSlot} - CEIL(${reservationHours.seatsPerSlot} * 0.6)`,
      })
      .where(and(eq(reservationHours.restaurantId, id), isNull(reservationHours.seatsInside), isNull(reservationHours.seatsOutside)));
  }

  // TABLES mode: the areas toggle doubles as "terrace section on/off". Disabling areas
  // deactivates the terrace (outside) tables so clients can't book them; re-enabling
  // brings them back. Interior tables are untouched; seats mode ignores tables entirely.
  if (parsed.data.areasEnabled !== undefined) {
    const mode = parsed.data.capacityMode ?? restaurant.capacityMode;
    if (mode === "tables") {
      await db
        .update(reservationTables)
        .set({ isActive: parsed.data.areasEnabled })
        .where(and(eq(reservationTables.restaurantId, id), eq(reservationTables.area, "outside")));

    }
  }

  // Tables added BEFORE zones were switched on carry no area. With zones on,
  // availability is filtered per area, so an area-less table matches NEITHER interior
  // nor terasă — it silently disappears from booking and the room looks fully booked.
  // Put them in the main room; the owner can move any of them to the terrace after.
  //
  // Keyed on the EFFECTIVE state, not on which switch was flipped: an owner can enable
  // zones while still on "capacitate totală" (where tables are unused, so nothing looks
  // wrong) and only later switch to "mese individuale". Checking only the areas toggle
  // would skip that path entirely and the bug would surface on the mode switch.
  const effectiveAreas = parsed.data.areasEnabled ?? restaurant.areasEnabled;
  if (effectiveAreas && (parsed.data.areasEnabled !== undefined || parsed.data.capacityMode !== undefined)) {
    await db
      .update(reservationTables)
      .set({ area: "inside" })
      .where(and(eq(reservationTables.restaurantId, id), isNull(reservationTables.area)));
  }

  // Switching to tables mode: bookings made in seats mode hold no table, so they'd
  // occupy nothing and the slot could be oversold. Give them real tables now (existing
  // bookings keep their date/time/party/status — only a table is attached) and report
  // any that couldn't be seated so the owner can handle them.
  let tableBackfill: TableBackfillReport | undefined;
  if (parsed.data.capacityMode === "tables" && restaurant.capacityMode !== "tables") {
    tableBackfill = await backfillTableAssignments(id);
  }

  // Audit: when a platform admin changes settings, email the acting admin.
  await auditAdminReservationChange(session, role, id, "setări (activare / mod / grup maxim)");

  return NextResponse.json({ ok: true, tableBackfill });
}
