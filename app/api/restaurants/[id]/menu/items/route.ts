/** Owner menu management — create a menu item. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuItems, menuCategories } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";

const createSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.string().max(40).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  allergens: z.array(z.string().max(40)).max(20).optional(),
  isAvailable: z.boolean().optional(),
});

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  return authorizeMenuEdit(session, role, restaurantId);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const d = parsed.data;

  // The category must belong to THIS restaurant (don't trust client).
  const [cat] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(and(eq(menuCategories.id, d.categoryId), eq(menuCategories.restaurantId, id)))
    .limit(1);
  if (!cat) return NextResponse.json({ error: "Categorie invalidă." }, { status: 400 });

  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${menuItems.position}), -1)` })
    .from(menuItems)
    .where(eq(menuItems.categoryId, d.categoryId));

  const [created] = await db
    .insert(menuItems)
    .values({
      restaurantId: id,
      categoryId: d.categoryId,
      name: d.name,
      description: d.description ?? null,
      price: d.price ?? null,
      imageUrl: d.imageUrl || null,
      allergens: d.allergens?.length ? JSON.stringify(d.allergens) : null,
      isAvailable: d.isAvailable ?? true,
      position: Number(maxPos) + 1,
    })
    .returning({ id: menuItems.id });

  return NextResponse.json({ ok: true, id: created!.id }, { status: 201 });
}
