/** Owner menu management — create a menu item. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuItems, menuCategories } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";

const createSchema = z.object({
  categoryId: z.string().min(1, "Alege o categorie pentru produs."),
  name: z.string().min(1, "Numele produsului este obligatoriu.").max(200, "Numele este prea lung (max. 200 de caractere)."),
  nameEn: z.string().max(200, "Numele în engleză este prea lung (max. 200 de caractere).").optional(),
  description: z.string().max(2000, "Descrierea este prea lungă (max. 2000 de caractere).").optional(),
  descriptionEn: z.string().max(2000, "Descrierea în engleză este prea lungă (max. 2000 de caractere).").optional(),
  price: z.string().max(40, "Prețul este prea lung.").optional(),
  imageUrl: z.string().url("Imaginea nu s-a încărcat corect. Încearcă din nou.").optional().or(z.literal("")),
  // Free text, e.g. "gluten, ouă, lapte" (legacy rows may hold a JSON array).
  allergens: z.string().max(500, "Lista de alergeni este prea lungă (max. 500 de caractere).").optional(),
  allergensEn: z.string().max(500, "Lista de alergeni în engleză este prea lungă (max. 500 de caractere).").optional(),
  calories: z.number().int().min(0).max(10000, "Caloriile trebuie să fie între 0 și 10000.").nullable().optional(),
  isVegan: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isFasting: z.boolean().optional(),
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
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide." }, { status: 400 });
  }
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
      nameEn: d.nameEn?.trim() || null,
      description: d.description ?? null,
      descriptionEn: d.descriptionEn?.trim() || null,
      price: d.price ?? null,
      imageUrl: d.imageUrl || null,
      allergens: d.allergens?.trim() || null,
      allergensEn: d.allergensEn?.trim() || null,
      calories: d.calories ?? null,
      isVegan: d.isVegan ?? false,
      isVegetarian: d.isVegetarian ?? false,
      isFasting: d.isFasting ?? false,
      isAvailable: d.isAvailable ?? true,
      position: Number(maxPos) + 1,
    })
    .returning({ id: menuItems.id });

  return NextResponse.json({ ok: true, id: created!.id }, { status: 201 });
}

/** Reorder the items INSIDE one category (ids in their new top-to-bottom order). */
const reorderSchema = z.object({
  categoryId: z.string().min(1),
  order: z.array(z.string()).min(1).max(500),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const parsed = reorderSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { categoryId, order } = parsed.data;

  // Only reposition items that really belong to this restaurant AND this category.
  const owned = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, id), eq(menuItems.categoryId, categoryId)));
  const ownedIds = new Set(owned.map((i) => i.id));
  const ids = order.filter((iid) => ownedIds.has(iid));

  await Promise.all(
    ids.map((iid, index) =>
      db.update(menuItems).set({ position: index, updatedAt: new Date() })
        .where(and(eq(menuItems.id, iid), eq(menuItems.restaurantId, id))),
    ),
  );
  return NextResponse.json({ ok: true });
}
