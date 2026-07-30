/** Owner menu management — categories. Gated by restaurant membership (owner) or platform staff. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories } from "@/lib/db/schema";
import { canManageRestaurant, authorizeMenuEdit } from "@/lib/restaurant-permissions";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const gate = await authorizeMenuEdit(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  // New category goes to the end (max position + 1).
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${menuCategories.position}), -1)` })
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, id));

  const [created] = await db
    .insert(menuCategories)
    .values({
      restaurantId: id,
      name: parsed.data.name,
      nameEn: parsed.data.nameEn?.trim() || null,
      position: Number(maxPos) + 1,
    })
    .returning({ id: menuCategories.id });

  return NextResponse.json({ ok: true, id: created!.id }, { status: 201 });
}

/** Reorder: the client sends the category ids in their new top-to-bottom order. */
const reorderSchema = z.object({ order: z.array(z.string()).min(1).max(200) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const gate = await authorizeMenuEdit(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = reorderSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  // Only reposition categories that really belong to this restaurant.
  const owned = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, id));
  const ownedIds = new Set(owned.map((c) => c.id));
  const ids = parsed.data.order.filter((cid) => ownedIds.has(cid));

  await Promise.all(
    ids.map((cid, index) =>
      db.update(menuCategories).set({ position: index, updatedAt: new Date() })
        .where(and(eq(menuCategories.id, cid), eq(menuCategories.restaurantId, id))),
    ),
  );
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || !(await canManageRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, id))
    .orderBy(asc(menuCategories.position));
  return NextResponse.json({ data: rows });
}
