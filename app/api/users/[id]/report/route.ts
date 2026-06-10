import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userReports } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  reason: z.string().min(10).max(500),
  listingId: z.string().optional(),
  conversationId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }

  const { id: reportedUserId } = await params;
  const reporterId = session.user.id;

  if (reporterId === reportedUserId) {
    return NextResponse.json({ error: "Nu te poți raporta pe tine." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 422 });
  }

  const { reason, listingId, conversationId } = parsed.data;

  // Prevent duplicate pending report from same reporter on same target
  const [existing] = await db
    .select({ id: userReports.id })
    .from(userReports)
    .where(
      and(
        eq(userReports.reportedUserId, reportedUserId),
        eq(userReports.reporterId, reporterId),
        eq(userReports.status, "pending")
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "Ai trimis deja un raport în așteptare pentru acest utilizator." },
      { status: 409 }
    );
  }

  await db.insert(userReports).values({
    reportedUserId,
    reporterId,
    listingId: listingId ?? null,
    conversationId: conversationId ?? null,
    reason,
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}
