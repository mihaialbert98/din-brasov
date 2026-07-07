/** Update / delete a menu item (incl. quick availability toggle). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuItems, menuCategories } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";

const patchSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  descriptionEn: z.string().max(2000).optional(),
  price: z.string().max(40).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  // Free text (legacy rows may hold a JSON array — normalized on read).
  allergens: z.string().max(300).optional(),
  allergensEn: z.string().max(300).optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  isVegan: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
});

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  return authorizeMenuEdit(session, role, restaurantId);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const d = parsed.data;

  // If moving to another category, it must belong to this restaurant.
  if (d.categoryId) {
    const [cat] = await db
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(and(eq(menuCategories.id, d.categoryId), eq(menuCategories.restaurantId, id)))
      .limit(1);
    if (!cat) return NextResponse.json({ error: "Categorie invalidă." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (d.categoryId !== undefined) patch.categoryId = d.categoryId;
  if (d.name !== undefined) patch.name = d.name;
  if (d.nameEn !== undefined) patch.nameEn = d.nameEn.trim() || null;
  if (d.description !== undefined) patch.description = d.description || null;
  if (d.descriptionEn !== undefined) patch.descriptionEn = d.descriptionEn.trim() || null;
  if (d.price !== undefined) patch.price = d.price || null;
  if (d.imageUrl !== undefined) patch.imageUrl = d.imageUrl || null;
  if (d.allergens !== undefined) patch.allergens = d.allergens.trim() || null;
  if (d.allergensEn !== undefined) patch.allergensEn = d.allergensEn.trim() || null;
  if (d.calories !== undefined) patch.calories = d.calories;
  if (d.isVegan !== undefined) patch.isVegan = d.isVegan;
  if (d.isAvailable !== undefined) patch.isAvailable = d.isAvailable;

  await db
    .update(menuItems)
    .set(patch)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, id)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  await db.delete(menuItems).where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, id)));
  return NextResponse.json({ ok: true });
}
