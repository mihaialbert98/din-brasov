import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { conversations, messages, listings, users } from "@/lib/db/schema";
import { eq, and, asc, ne, isNull } from "drizzle-orm";
import Link from "next/link";
import { ConversationInput } from "./ConversationInput";
import MessageList from "./MessageList";
import { ReportUserButton } from "@/components/anunturi/ReportUserButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conversație" };

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");
  const userId = session.user.id;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conv || (conv.buyerId !== userId && conv.sellerId !== userId)) notFound();

  const [listing] = await db
    .select({ title: listings.title, slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, conv.listingId))
    .limit(1);

  const otherPartyId = conv.buyerId === userId ? conv.sellerId : conv.buyerId;
  const [other] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, otherPartyId))
    .limit(1);

  const initialMessages = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      status: messages.status,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, id), ne(messages.status, "flagged")))
    .orderBy(asc(messages.createdAt));

  // Mark messages from the other party as read on page load
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

  return (
    <div className="w-full max-w-2xl flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/mesaje" className="text-gray-400 hover:text-gray-700 transition-colors" aria-label="Înapoi la mesaje">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{other?.name ?? "Utilizator"}</p>
          {listing && (
            <Link
              href={`/anunturi/${listing.slug}`}
              className="text-sm text-[#c84b1e] hover:underline truncate block"
            >
              Re: {listing.title}
            </Link>
          )}
        </div>
        <ReportUserButton
          reportedUserId={otherPartyId}
          reportedUserName={other?.name ?? undefined}
          conversationId={id}
        />
      </div>

      {/* Messages — polls every 3s for new messages */}
      <MessageList
        conversationId={id}
        currentUserId={userId}
        initialMessages={initialMessages}
      />

      {/* Input */}
      {conv.status === "blocked" ? (
        <p className="text-center text-red-500 text-sm py-3">
          Această conversație a fost blocată.
        </p>
      ) : (
        <ConversationInput conversationId={id} />
      )}
    </div>
  );
}
