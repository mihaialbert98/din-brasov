import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages, listings } from "@/lib/db/schema";
import { eq, or, desc, and, ne } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const userId = session.user.id;

  const convs = await db
    .select({
      id: conversations.id,
      listingId: conversations.listingId,
      listingTitle: listings.title,
      listingSlug: listings.slug,
      buyerId: conversations.buyerId,
      sellerId: conversations.sellerId,
      status: conversations.status,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .leftJoin(listings, eq(conversations.listingId, listings.id))
    .where(or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId)))
    .orderBy(desc(conversations.updatedAt));

  const result = await Promise.all(
    convs.map(async (conv) => {
      const [lastMessage] = await db
        .select({ body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId })
        .from(messages)
        .where(and(eq(messages.conversationId, conv.id), ne(messages.status, "flagged")))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return {
        ...conv,
        lastMessage: lastMessage ?? null,
        isBuyer: conv.buyerId === userId,
      };
    })
  );

  return NextResponse.json({ data: result });
}
