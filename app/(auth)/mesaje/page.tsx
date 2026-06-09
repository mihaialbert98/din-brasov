import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { conversations, messages, listings, users } from "@/lib/db/schema";
import { eq, or, desc, and, ne } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mesajele mele" };

export default async function MesajePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");
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

  // Get last message + other party name for each conversation
  const enriched = await Promise.all(
    convs.map(async (conv) => {
      const [lastMsg] = await db
        .select({ body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId })
        .from(messages)
        .where(
          and(eq(messages.conversationId, conv.id), ne(messages.status, "flagged"))
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const isBuyer = conv.buyerId === userId;
      const otherPartyId = isBuyer ? conv.sellerId : conv.buyerId;
      const [other] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, otherPartyId))
        .limit(1);

      return { ...conv, lastMsg, isBuyer, otherName: other?.name ?? "Utilizator" };
    })
  );

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-3xl font-bold text-[#1a1a1a] mb-6">Mesajele mele</h1>

      {enriched.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8d9c5] p-10 text-center text-gray-400">
          <p className="text-4xl mb-3">💬</p>
          <p className="font-medium">Nu ai nicio conversație încă.</p>
          <p className="text-sm mt-1">
            Găsește un anunț și trimite un mesaj vânzătorului.
          </p>
          <Link href="/anunturi" className="mt-4 inline-block text-[#c84b1e] font-medium hover:underline">
            Caută anunțuri →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map((conv) => (
            <Link
              key={conv.id}
              href={`/mesaje/${conv.id}`}
              className="block bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-[#e8d9c5] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {conv.isBuyer ? "Cumpărător" : "Vânzător"}
                    </span>
                    <span className="font-semibold text-gray-900 truncate">
                      {conv.otherName}
                    </span>
                  </div>
                  <p className="text-sm text-[#c84b1e] font-medium truncate mb-1">
                    Re: {conv.listingTitle ?? "Anunț șters"}
                  </p>
                  {conv.lastMsg ? (
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {conv.lastMsg.senderId === userId ? "Tu: " : ""}
                      {conv.lastMsg.body}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Niciun mesaj încă</p>
                  )}
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {conv.updatedAt ? formatDate(conv.updatedAt, { day: "numeric", month: "short" }) : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
