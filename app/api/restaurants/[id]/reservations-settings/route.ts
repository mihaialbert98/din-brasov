/**
 * Owner: enable/disable taking reservations + choose the confirmation mode.
 * Requires the admin grant to already be on (else enabling is refused). Gated by
 * authorizeMenuEdit (owner + 2FA unlock, or platform admin) like appearance.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";
import { auditAdminReservationChange } from "@/lib/reservations";

const schema = z.object({
  enabled: z.boolean().optional(),
  confirmMode: z.enum(["auto", "manual"]).optional(),
  maxPartySize: z.number().int().min(1).max(50).optional(),
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

  await db.update(restaurants).set(patch).where(eq(restaurants.id, id));

  // Audit: when a platform admin changes settings, email the acting admin.
  await auditAdminReservationChange(session, role, id, "setări (activare / mod / grup maxim)");

  return NextResponse.json({ ok: true });
}
