import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, listingReports, adminAuditLog } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { hashIp, getIp } from "@/lib/rate-limit";

const schema = z.object({
  reason: z.string().min(3).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Trebuie să fii autentificat pentru a raporta." }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const [listing] = await db
    .select({ status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  const ipHash = hashIp(getIp(req));

  await db.insert(listingReports).values({
    listingId: id,
    reporterId: session.user.id,
    ipHash,
    reason: parsed.data.reason,
  });

  // Auto-suspend after 3 reports from unique IPs — only if listing is still active
  if (listing.status === "active") {
    const [row] = await db
      .select({ c: count() })
      .from(listingReports)
      .where(eq(listingReports.listingId, id));

    const uniqueIps = await db
      .selectDistinct({ ipHash: listingReports.ipHash })
      .from(listingReports)
      .where(eq(listingReports.listingId, id));

    if (uniqueIps.length >= 3) {
      await db
        .update(listings)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(and(eq(listings.id, id), eq(listings.status, "active")));

      await db.insert(adminAuditLog).values({
        adminId: session.user.id,
        action: "auto_suspend_listing",
        entityType: "listing",
        entityId: id,
        metadataJson: JSON.stringify({ uniqueReportIps: uniqueIps.length, totalReports: row?.c }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
