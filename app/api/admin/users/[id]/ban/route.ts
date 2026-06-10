import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, userReports, supportConversations, supportMessages, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  days: z.number().int().min(1).max(365),
  reportId: z.string().optional(),
  reason: z.string().max(500).optional(),
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

  const { days, reportId, reason } = parsed.data;
  const bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // Set bannedUntil on user
  await db.update(users).set({ bannedUntil }).where(eq(users.id, targetUserId));

  // Mark report as reviewed if provided
  if (reportId) {
    await db
      .update(userReports)
      .set({ status: "reviewed", reviewedBy: session.user.id, reviewedAt: new Date() })
      .where(eq(userReports.id, reportId));
  }

  // Open a support conversation and send the ban notification
  const subject = "Suspendare cont";
  const body =
    `Contul tău a fost suspendat temporar pentru ${days} ${days === 1 ? "zi" : "zile"}.` +
    (reason ? ` Motivul: ${reason}.` : "") +
    " Poți contesta această decizie răspunzând în această conversație.";

  // Find or create a support conversation for this user
  const [existingConv] = await db
    .select({ id: supportConversations.id })
    .from(supportConversations)
    .where(eq(supportConversations.userId, targetUserId))
    .limit(1);

  let convId: string;
  if (existingConv) {
    convId = existingConv.id;
    await db
      .update(supportConversations)
      .set({ status: "open", assignedTo: session.user.id, updatedAt: new Date() })
      .where(eq(supportConversations.id, convId));
  } else {
    const [newConv] = await db
      .insert(supportConversations)
      .values({
        userId: targetUserId,
        assignedTo: session.user.id,
        subject,
        status: "open",
      })
      .returning({ id: supportConversations.id });
    convId = newConv.id;
  }

  await db.insert(supportMessages).values({
    conversationId: convId,
    senderId: session.user.id,
    body,
  });

  // Audit log
  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "ban_user",
    entityType: "user",
    entityId: targetUserId,
    metadataJson: JSON.stringify({ days, bannedUntil: bannedUntil.toISOString(), reportId, reason }),
  });

  return NextResponse.json({ ok: true });
}
