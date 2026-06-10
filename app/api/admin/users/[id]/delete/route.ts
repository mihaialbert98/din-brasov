import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userReports, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requestUserDeletion } from "@/lib/gdpr";
import { z } from "zod";

const bodySchema = z.object({
  reportId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  // Only admins can permanently delete accounts
  if (!session?.user?.id || role !== "admin") {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 422 });
  }

  const { reportId } = parsed.data;

  await requestUserDeletion(targetUserId);

  if (reportId) {
    await db
      .update(userReports)
      .set({ status: "reviewed", reviewedBy: session.user.id, reviewedAt: new Date() })
      .where(eq(userReports.id, reportId));
  }

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "delete_user_via_report",
    entityType: "user",
    entityId: targetUserId,
    metadataJson: JSON.stringify({ reportId }),
  });

  return NextResponse.json({ ok: true });
}
