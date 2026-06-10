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
  const [conv] = await db
    .select({ id: supportConversations.id, assignedTo: supportConversations.assignedTo })
    .from(supportConversations)
    .where(eq(supportConversations.id, id))
    .limit(1);

  if (!conv) return NextResponse.json({ error: "Negăsit." }, { status: 404 });

  await db
    .update(supportConversations)
    .set({ assignedTo: session.user.id, updatedAt: new Date() })
    .where(eq(supportConversations.id, id));

  return NextResponse.json({ ok: true });
}
