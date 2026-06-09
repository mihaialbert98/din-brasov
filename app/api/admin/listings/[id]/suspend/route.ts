import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;

  const [listing] = await db.select({ status: listings.status }).from(listings).where(eq(listings.id, id)).limit(1);
  if (!listing) {
    return NextResponse.json({ error: "Anunț negăsit." }, { status: 404 });
  }

  await db.update(listings).set({ status: "suspended", updatedAt: new Date() }).where(eq(listings.id, id));
  await db.insert(adminAuditLog).values({
    adminId: session!.user!.id!,
    action: "suspend_listing",
    entityType: "listing",
    entityId: id,
    metadataJson: JSON.stringify({ previousStatus: listing.status }),
  });

  return NextResponse.redirect(new URL("/admin/anunturi", req.url));
}
