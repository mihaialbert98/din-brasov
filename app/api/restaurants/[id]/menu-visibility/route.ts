/**
 * Owner: show/hide the PUBLIC read-only menu on the Localuri page, without
 * deleting menu items. Does not affect the QR table menu. Owner or platform admin
 * (no 2FA — like the other reservation/visibility settings).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { authorizeReservationSettings } from "@/lib/restaurant-permissions";

const schema = z.object({ menuPublic: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  const gate = await authorizeReservationSettings(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  await db
    .update(restaurants)
    .set({ menuPublic: parsed.data.menuPublic, updatedAt: new Date() })
    .where(eq(restaurants.id, id));

  return NextResponse.json({ ok: true, menuPublic: parsed.data.menuPublic });
}
