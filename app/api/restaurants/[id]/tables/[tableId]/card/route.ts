/**
 * Renders a table's plain QR code as a PNG (black-on-white, no template/text).
 * PLATFORM STAFF ONLY (admin/moderator) — the QR is printed by the Din Brașov team.
 * A plain QR needs no image compositing or fonts, so it works reliably on serverless.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { isPlatformStaff } from "@/lib/restaurant-permissions";
import { absoluteUrl } from "@/lib/seo";

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
    .select({ qrToken: restaurantTables.qrToken })
    .from(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, id)))
    .limit(1);
  if (!table) return NextResponse.json({ error: "Negăsit." }, { status: 404 });

  // High-res, printable, generous quiet zone.
  const png = await QRCode.toBuffer(absoluteUrl(`/m/${table.qrToken}`), {
    type: "png",
    width: 1000,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
