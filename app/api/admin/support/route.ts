import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportConversations, supportMessages, users } from "@/lib/db/schema";
import { eq, desc, isNull } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user?.id || (role !== "moderator" && role !== "admin")) {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  const convs = await db
    .select({
      id: supportConversations.id,
      subject: supportConversations.subject,
      status: supportConversations.status,
      createdAt: supportConversations.createdAt,
      updatedAt: supportConversations.updatedAt,
      assignedTo: supportConversations.assignedTo,
      userId: supportConversations.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(supportConversations)
    .leftJoin(users, eq(supportConversations.userId, users.id))
    .orderBy(desc(supportConversations.updatedAt));

  // Get last message for each conv
  const enriched = await Promise.all(
    convs.map(async (conv) => {
      const [last] = await db
        .select({ body: supportMessages.body, createdAt: supportMessages.createdAt })
        .from(supportMessages)
        .where(eq(supportMessages.conversationId, conv.id))
        .orderBy(desc(supportMessages.createdAt))
        .limit(1);
      return { ...conv, lastMessage: last ?? null };
    })
  );

  const unassigned = enriched.filter((c) => !c.assignedTo && c.status === "open");
  const mine = enriched.filter(
    (c) => c.assignedTo === session.user!.id && c.status === "open"
  );
  const other = enriched.filter(
    (c) => c.assignedTo && c.assignedTo !== session.user!.id
  );
  const closed = enriched.filter((c) => c.status === "closed");

  return NextResponse.json({ unassigned, mine, other, closed });
}
