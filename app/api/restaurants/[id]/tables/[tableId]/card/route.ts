/**
 * Renders a table's business card as a PNG (QR + optional name composited onto the
 * Din Brașov template). Manager-only. Used by the Mese & QR preview + print/download.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, restaurantTables } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";
import { renderCard } from "@/lib/restaurant-card";
import { absoluteUrl } from "@/lib/seo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canManageRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const [rest] = await db
    .select({ name: restaurants.name, cardTemplateUrl: restaurants.cardTemplateUrl, cardOverlayName: restaurants.cardOverlayName })
    .from(restaurants)
    .where(eq(restaurants.id, id))
    .limit(1);
  const [table] = await db
    .select({ qrToken: restaurantTables.qrToken, label: restaurantTables.label })
    .from(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)))
    .limit(1);

  if (!rest || !table) return NextResponse.json({ error: "Negăsit." }, { status: 404 });

  // Custom template (if set) is fetched; otherwise the default brand card is used.
  let template: Buffer | undefined;
  if (rest.cardTemplateUrl) {
    try {
      const res = await fetch(rest.cardTemplateUrl);
      if (res.ok) template = Buffer.from(await res.arrayBuffer());
    } catch {
      /* fall back to default template */
    }
  }

  const png = await renderCard({
    restaurantName: rest.name,
    menuUrl: absoluteUrl(`/m/${table.qrToken}`),
    tableLabel: table.label,
    template,
    overlayName: rest.cardOverlayName,
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
