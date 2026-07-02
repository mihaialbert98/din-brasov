/** Rename / delete a menu category. Deleting cascades to its items (FK on delete cascade). */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuCategories } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";

const patchSchema = z.object({
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional(),
});

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  return authorizeMenuEdit(session, role, restaurantId);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  const { id, categoryId } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });

  await db
    .update(menuCategories)
    .set({
      name: parsed.data.name,
      nameEn: parsed.data.nameEn?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, id)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  const { id, categoryId } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  await db
    .delete(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, id)));

  return NextResponse.json({ ok: true });
}
