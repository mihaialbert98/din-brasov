/** Owner menu management — categories. Gated by restaurant membership (owner) or platform staff. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, asc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";

const createSchema = z.object({ name: z.string().min(1).max(120) });

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 as const };
  const ok = await canManageRestaurant(session.user.id, restaurantId, role);
  if (!ok) return { error: "Neautorizat", status: 403 as const };
  return { userId: session.user.id };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  // New category goes to the end (max position + 1).
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${menuCategories.position}), -1)` })
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, id));

  const [created] = await db
    .insert(menuCategories)
    .values({ restaurantId: id, name: parsed.data.name, position: Number(maxPos) + 1 })
    .returning({ id: menuCategories.id });

  return NextResponse.json({ ok: true, id: created!.id }, { status: 201 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, id))
    .orderBy(asc(menuCategories.position));
  return NextResponse.json({ data: rows });
}
