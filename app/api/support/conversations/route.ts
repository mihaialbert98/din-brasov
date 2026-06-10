import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportConversations, supportMessages } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  subject: z.string().min(3).max(100),
  body: z.string().min(5).max(2000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }

  const convs = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.userId, session.user.id))
    .orderBy(desc(supportConversations.updatedAt));

  return NextResponse.json({ data: convs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 422 });
  }

  const { subject, body } = parsed.data;

  const [conv] = await db
    .insert(supportConversations)
    .values({
      userId: session.user.id,
      subject,
      status: "open",
    })
    .returning({ id: supportConversations.id });

  await db.insert(supportMessages).values({
    conversationId: conv.id,
    senderId: session.user.id,
    body,
  });

  return NextResponse.json({ ok: true, conversationId: conv.id }, { status: 201 });
}
