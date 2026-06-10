import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { supportConversations, supportMessages, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Suport" };

export default async function AdminSuportPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user?.id || (role !== "moderator" && role !== "admin")) redirect("/admin");
  const myId = session.user.id;

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

  const enriched = await Promise.all(
    convs.map(async (conv) => {
      const [last] = await db
        .select({ body: supportMessages.body })
        .from(supportMessages)
        .where(eq(supportMessages.conversationId, conv.id))
        .orderBy(desc(supportMessages.createdAt))
        .limit(1);
      return { ...conv, lastMessage: last?.body ?? null };
    })
  );

  const unassigned = enriched.filter((c) => !c.assignedTo && c.status === "open");
  const mine = enriched.filter((c) => c.assignedTo === myId && c.status === "open");
  const other = enriched.filter((c) => c.assignedTo && c.assignedTo !== myId && c.status === "open");
  const closed = enriched.filter((c) => c.status === "closed");

  function ConvCard({ conv }: { conv: (typeof enriched)[number] }) {
    return (
      <Link
        href={`/admin/suport/${conv.id}`}
        className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{conv.subject}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {conv.userName ?? "Utilizator"} — {conv.userEmail}
            </p>
            {conv.lastMessage && (
              <p className="text-sm text-gray-400 line-clamp-1 mt-1">{conv.lastMessage}</p>
            )}
          </div>
          <div className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
            {conv.updatedAt ? formatDate(conv.updatedAt, { day: "numeric", month: "short" }) : ""}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Suport</h1>
        <span className="text-sm text-gray-500">{enriched.length} conversații total</span>
      </div>

      {/* Unassigned */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          Nepreluate ({unassigned.length})
        </h2>
        {unassigned.length === 0 ? (
          <p className="text-sm text-gray-400">Niciuna — totul este acoperit.</p>
        ) : (
          <div className="space-y-2">
            {unassigned.map((c) => <ConvCard key={c.id} conv={c} />)}
          </div>
        )}
      </section>

      {/* Mine */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          Preluate de mine ({mine.length})
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-gray-400">Nu ai preluat nicio conversație.</p>
        ) : (
          <div className="space-y-2">
            {mine.map((c) => <ConvCard key={c.id} conv={c} />)}
          </div>
        )}
      </section>

      {/* Assigned to others */}
      {other.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Preluate de alții ({other.length})
          </h2>
          <div className="space-y-2">
            {other.map((c) => <ConvCard key={c.id} conv={c} />)}
          </div>
        </section>
      )}

      {/* Closed */}
      {closed.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-400 mb-3">
            Închise ({closed.length})
          </h2>
          <div className="space-y-2 opacity-60">
            {closed.map((c) => <ConvCard key={c.id} conv={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}
