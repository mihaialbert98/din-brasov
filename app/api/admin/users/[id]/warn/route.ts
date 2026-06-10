import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userReports, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  reportId: z.string(),
  note: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user?.id || (role !== "moderator" && role !== "admin")) {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 422 });
  }

  const { reportId, note } = parsed.data;

  await db
    .update(userReports)
    .set({
      status: "dismissed",
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
    })
    .where(eq(userReports.id, reportId));

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "warn_user",
    entityType: "user",
    entityId: targetUserId,
    metadataJson: JSON.stringify({ reportId, note }),
  });

  return NextResponse.json({ ok: true });
}
