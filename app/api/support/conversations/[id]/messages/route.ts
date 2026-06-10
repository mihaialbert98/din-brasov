import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportConversations, supportMessages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

async function getConvAndVerifyAccess(id: string, userId: string, role: string) {
  const [conv] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, id))
    .limit(1);
  if (!conv) return null;
  // The conversation's owner, or any moderator/admin can access
  const isMod = role === "moderator" || role === "admin";
  if (conv.userId !== userId && !isMod) return null;
  return conv;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }
  const { id } = await params;
  const role = (session.user as any).role ?? "user";

  const conv = await getConvAndVerifyAccess(id, session.user.id, role);
  if (!conv) return NextResponse.json({ error: "Negăsit." }, { status: 404 });

  const msgs = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, id))
    .orderBy(asc(supportMessages.createdAt));

  return NextResponse.json({ data: msgs, conv });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }
  const { id } = await params;
  const role = (session.user as any).role ?? "user";

  const conv = await getConvAndVerifyAccess(id, session.user.id, role);
  if (!conv) return NextResponse.json({ error: "Negăsit." }, { status: 404 });
  if (conv.status === "closed") {
    return NextResponse.json({ error: "Conversația este închisă." }, { status: 403 });
  }

  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Mesaj invalid." }, { status: 422 });
  }

  await db.insert(supportMessages).values({
    conversationId: id,
    senderId: session.user.id,
    body: parsed.data.body,
  });

  // Update conversation timestamp
  await db
    .update(supportConversations)
    .set({ updatedAt: new Date() })
    .where(eq(supportConversations.id, id));

  return NextResponse.json({ ok: true });
}
