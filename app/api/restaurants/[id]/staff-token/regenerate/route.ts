/**
 * Regenerate the restaurant's shared staff-board token — invalidates the old
 * /s/{token} link (revokes access for staff who left). Owner via the menu-edit
 * 2FA unlock, or platform admin.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  // Same gate as menu mutations: owner needs an active 2FA unlock; admin bypasses.
  const gate = await authorizeMenuEdit(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [updated] = await db
    .update(restaurants)
    .set({ staffToken: crypto.randomUUID(), updatedAt: new Date() })
    .where(eq(restaurants.id, id))
    .returning({ staffToken: restaurants.staffToken });

  if (!updated) return NextResponse.json({ error: "Restaurant negăsit." }, { status: 404 });
  return NextResponse.json({ ok: true, staffToken: updated.staffToken });
}
