import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { supportConversations, supportMessages, users } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import SupportMessageList from "./SupportMessageList";
import SupportInput from "./SupportInput";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conversație suport" };

type Props = { params: Promise<{ id: string }> };

export default async function SupportConversationPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");
  const userId = session.user.id;
  const role = (session.user as any).role ?? "user";

  const [conv] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, id))
    .limit(1);

  // User sees own conv; mod/admin sees all
  const isMod = role === "moderator" || role === "admin";
  if (!conv || (conv.userId !== userId && !isMod)) notFound();

  // Assigned moderator name
  let assignedName: string | null = null;
  if (conv.assignedTo) {
    const [mod] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, conv.assignedTo))
      .limit(1);
    assignedName = mod?.name ?? null;
  }

  const initialMessages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, id))
    .orderBy(asc(supportMessages.createdAt));

  return (
    <div className="w-full max-w-2xl flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/mesaje" className="text-gray-400 hover:text-gray-700 transition-colors" aria-label="Înapoi">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{conv.subject}</p>
          <p className="text-sm text-gray-500">
            {conv.status === "closed"
              ? "Conversație închisă"
              : assignedName
              ? `Preluat de ${assignedName}`
              : "Echipa suport Din Brașov"}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
          conv.status === "open" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          {conv.status === "open" ? "Deschis" : "Închis"}
        </span>
      </div>

      <SupportMessageList
        conversationId={id}
        currentUserId={userId}
        initialMessages={initialMessages}
      />

      {conv.status === "closed" ? (
        <p className="text-center text-gray-400 text-sm py-3">
          Această conversație este închisă.
        </p>
      ) : (
        <SupportInput conversationId={id} />
      )}
    </div>
  );
}
