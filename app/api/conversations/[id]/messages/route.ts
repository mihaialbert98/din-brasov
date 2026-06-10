import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages, users } from "@/lib/db/schema";
import { eq, and, asc, ne, isNull } from "drizzle-orm";
import { detectUrls, checkMessageLimit } from "@/lib/rate-limit";

const sendSchema = z.object({
  body: z.string().min(1).max(2000),
  formLoadedAt: z.number(),
  honeypot: z.string().max(0).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const role = (session.user as any).role ?? "user";
  const isMod = role === "moderator" || role === "admin";

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conv || (!isMod && conv.buyerId !== userId && conv.sellerId !== userId)) {
    return NextResponse.json({ error: "Conversație negăsită." }, { status: 404 });
  }

  const msgs = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderId: messages.senderId,
      status: messages.status,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      isMod
        ? eq(messages.conversationId, id) // admins see all messages including flagged
        : and(eq(messages.conversationId, id), ne(messages.status, "flagged"))
    )
    .orderBy(asc(messages.createdAt));

  // Mark messages from the other party as read
  if (!isMod) {
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.conversationId, id),
          ne(messages.senderId, userId),
          isNull(messages.readAt)
        )
      );
  }

  return NextResponse.json({ data: msgs, conversation: conv });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conv || (conv.buyerId !== userId && conv.sellerId !== userId)) {
    return NextResponse.json({ error: "Conversație negăsită." }, { status: 404 });
  }

  if (conv.status === "blocked") {
    return NextResponse.json({ error: "Această conversație a fost blocată." }, { status: 403 });
  }

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  if (parsed.data.honeypot && parsed.data.honeypot.length > 0) {
    return NextResponse.json({ ok: true }); // silently discard
  }

  if (Date.now() - parsed.data.formLoadedAt < 2000) {
    return NextResponse.json({ error: "Prea rapid. Încearcă din nou." }, { status: 400 });
  }

  const [sender] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const { allowed, reason } = await checkMessageLimit(userId, sender?.createdAt ?? new Date());
  if (!allowed) {
    return NextResponse.json({ error: reason }, { status: 429 });
  }

  const hasUrl = detectUrls(parsed.data.body);

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: id,
      senderId: userId,
      body: parsed.data.body,
      hasUrl,
      status: hasUrl ? "flagged" : "delivered",
    })
    .returning();

  // Update conversation updatedAt for inbox sorting
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));

  return NextResponse.json({ ok: true, message: msg });
}
