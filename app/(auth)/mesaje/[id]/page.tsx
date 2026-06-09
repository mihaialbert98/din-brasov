import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { conversations, messages, listings, users } from "@/lib/db/schema";
import { eq, and, asc, ne } from "drizzle-orm";
import Link from "next/link";
import { ConversationInput } from "./ConversationInput";
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

  const msgs = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, id), ne(messages.status, "flagged")))
    .orderBy(asc(messages.createdAt));

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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 bg-white rounded-2xl shadow-sm border border-[#e8d9c5] p-4">
        {msgs.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">
            Niciun mesaj încă. Fii primul care scrie!
          </p>
        ) : (
          msgs.map((msg) => {
            const isMine = msg.senderId === userId;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMine
                      ? "bg-[#c84b1e] text-white rounded-tr-sm"
                      : "bg-gray-100 text-gray-800 rounded-tl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  <p className={`text-xs mt-1 ${isMine ? "text-white/60" : "text-gray-400"}`}>
                    {msg.createdAt
                      ? new Intl.DateTimeFormat("ro-RO", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "numeric",
                          month: "short",
                        }).format(new Date(msg.createdAt))
                      : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

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
