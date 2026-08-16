/**
 * Renders a table's QR code as an SVG, black-on-white, with the table's name printed in
 * the middle so a stack of printed stickers can be told apart before they go on the tables.
 * PLATFORM STAFF ONLY (admin/moderator) — the QR is printed by the Din Brașov team.
 *
 * SVG rather than a composited PNG: no canvas, no native image library and no font files,
 * so it stays as serverless-friendly as the plain PNG it replaces, and it prints sharp at
 * any size. See lib/qr-label.ts for why the label is safe to put there at all.
 *
 * The encoded URL is unchanged, so codes already printed keep working.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import { absoluteUrl } from "@/lib/seo";
import { qrWithLabel } from "@/lib/qr-label";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  // Only Din Brașov admins/moderators may access + download the QR codes.
  if (!isPlatformStaff(role)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const [table] = await db
    .select({ qrToken: restaurantTables.qrToken, label: restaurantTables.label })
    .from(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)))
    .limit(1);
  if (!table) return NextResponse.json({ error: "Negăsit." }, { status: 404 });

  const svg = await qrWithLabel(absoluteUrl(`/m/${table.qrToken}`), table.label);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
