import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportConversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user?.id || (role !== "moderator" && role !== "admin")) {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  const { id } = await params;
  await db
    .update(supportConversations)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(supportConversations.id, id));

  return NextResponse.json({ ok: true });
}
