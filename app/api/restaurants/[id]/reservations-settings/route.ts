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
import { restaurants, reservationHours } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";

const schema = z.object({
  enabled: z.boolean().optional(),
  confirmMode: z.enum(["auto", "manual"]).optional(),
  maxPartySize: z.number().int().min(1).max(50).optional(),
  areasEnabled: z.boolean().optional(),
  // Turn time — how long a booking occupies its seats (minutes). 30 min – 6 h.
  turnMinutes: z.number().int().min(30).max(360).optional(),
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
    .select({ adminGrant: restaurants.reservationsEnabledByAdmin })
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

  // Audit: when a platform admin changes settings, email the acting admin.
  await auditAdminReservationChange(session, role, id, "setări (activare / mod / grup maxim)");

  return NextResponse.json({ ok: true });
}
