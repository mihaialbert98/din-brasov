/**
 * Menu appearance — set the customer-menu design + color theme. Owner (via the
 * menu-edit 2FA unlock) or platform admin. Switching TO a photos-required design
 * (e.g. "modern") is blocked until every menu item has a photo; the response lists
 * which items are missing one so the UI can prompt the owner to complete them.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, menuItems } from "@/lib/db/schema";
import { authorizeMenuEdit } from "@/lib/restaurant-permissions";
import { getDesign, isValidDesign, isValidTheme } from "@/lib/menu-themes";

const schema = z.object({
  design: z.string(),
  theme: z.string(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  const gate = await authorizeMenuEdit(session, role, id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { design, theme } = parsed.data;

  if (!isValidDesign(design) || !isValidTheme(design, theme)) {
    return NextResponse.json({ error: "Design sau temă invalidă." }, { status: 400 });
  }

  // Photos-required design → every item must have an image before switching.
  if (getDesign(design).photosRequired) {
    const items = await db
      .select({ name: menuItems.name, imageUrl: menuItems.imageUrl })
      .from(menuItems)
      .where(eq(menuItems.restaurantId, id));
    const missing = items.filter((it) => !it.imageUrl).map((it) => it.name);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Acest design necesită fotografii pentru toate produsele.",
          code: "photos_required",
          missing,
        },
        { status: 409 }
      );
    }
  }

  await db
    .update(restaurants)
    .set({ menuDesign: design, menuTheme: theme, updatedAt: new Date() })
    .where(eq(restaurants.id, id));

  return NextResponse.json({ ok: true, design, theme });
}
