import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";
import { sendWeeklyDigest } from "@/lib/newsletter-send";

export const maxDuration = 60;

const schema = z.object({ dryRun: z.boolean().optional(), force: z.boolean().optional() });

function canSend(role: string | undefined) {
  return role === "admin" || role === "moderator";
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || !canSend(role)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const dryRun = parsed.data.dryRun ?? false;
  const force = parsed.data.force ?? false;

  const result = await sendWeeklyDigest({ dryRun, force });

  if (!dryRun) {
    await db.insert(adminAuditLog).values({
      adminId: session.user.id,
      action: "send_newsletter_digest",
      entityType: "newsletter",
      entityId: "weekly_digest",
      metadataJson: JSON.stringify({
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        force,
      }),
    });
  }

  return NextResponse.json({ ok: true, dryRun, ...result });
}
