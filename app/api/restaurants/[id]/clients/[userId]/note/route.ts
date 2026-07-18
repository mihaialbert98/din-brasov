/** Owner/admin upserts a private note about one of their account-holding clients. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantClientNotes } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";

const schema = z.object({ note: z.string().max(1000) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canManageRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const note = parsed.data.note.trim();

  const [existing] = await db
    .select({ id: restaurantClientNotes.id })
    .from(restaurantClientNotes)
    .where(and(eq(restaurantClientNotes.restaurantId, id), eq(restaurantClientNotes.userId, userId)))
    .limit(1);

  if (existing) {
    await db
      .update(restaurantClientNotes)
      .set({ note, updatedAt: new Date() })
      .where(eq(restaurantClientNotes.id, existing.id));
  } else {
    await db.insert(restaurantClientNotes).values({ restaurantId: id, userId, note });
  }

  return NextResponse.json({ ok: true });
}
