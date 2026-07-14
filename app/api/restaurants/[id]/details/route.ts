/**
 * Owner: edit basic public details (currently the cuisine/type). Owner or platform
 * admin, no 2FA. Mirrors cuisineType onto the linked Localuri place so the card can
 * render it without a join.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, places } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";

const schema = z.object({
  cuisineType: z.string().max(60).optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  const gate = await authorizeReservationSettings(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  const cuisineType = parsed.data.cuisineType?.trim() || null;

  const [r] = await db
    .update(restaurants)
    .set({ cuisineType, updatedAt: new Date() })
    .where(eq(restaurants.id, id))
    .returning({ placeId: restaurants.placeId });

  // Mirror onto the linked place (the Localuri card reads places).
  if (r?.placeId) {
    await db.update(places).set({ cuisineType, updatedAt: new Date() }).where(eq(places.id, r.placeId));
  }

  return NextResponse.json({ ok: true, cuisineType });
}
