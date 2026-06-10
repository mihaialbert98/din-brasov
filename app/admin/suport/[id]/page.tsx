import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  supportConversations, supportMessages, users, userReports,
  listings, conversations, messages,
} from "@/lib/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import AdminSupportActions from "./AdminSupportActions";
import SupportMessageList from "@/app/(auth)/mesaje/suport/[id]/SupportMessageList";
import SupportInput from "@/app/(auth)/mesaje/suport/[id]/SupportInput";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Conversație suport" };

type Props = { params: Promise<{ id: string }> };

const msgFmt = new Intl.DateTimeFormat("ro-RO", {
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

export default async function AdminSupportConvPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user?.id || (role !== "moderator" && role !== "admin")) redirect("/admin");
  const myId = session.user.id;

  const [conv] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.id, id))
    .limit(1);

  if (!conv) notFound();

  const [targetUser] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      bannedUntil: users.bannedUntil,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, conv.userId))
    .limit(1);

  // All reports for this user (as reported user)
  const reports = await db
    .select({
      id: userReports.id,
      reason: userReports.reason,
      status: userReports.status,
      createdAt: userReports.createdAt,
      listingId: userReports.listingId,
      conversationId: userReports.conversationId,
    })
    .from(userReports)
    .where(eq(userReports.reportedUserId, conv.userId))
    .orderBy(desc(userReports.createdAt))
    .limit(10);

  // If any report links to a marketplace conversation, fetch it
  const reportedConvId = reports.find((r) => r.conversationId)?.conversationId ?? null;
  let reportedConvThread: {
    messages: { id: string; body: string; senderId: string; status: string; createdAt: Date | null }[];
    buyerName: string | null;
    sellerName: string | null;
    buyerId: string;
    sellerId: string;
    listingTitle: string | null;
  } | null = null;

  if (reportedConvId) {
    const [mktConv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, reportedConvId))
      .limit(1);

    if (mktConv) {
      const [buyer] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, mktConv.buyerId))
        .limit(1);
      const [seller] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, mktConv.sellerId))
        .limit(1);
      const [listing] = await db
        .select({ title: listings.title })
        .from(listings)
        .where(eq(listings.id, mktConv.listingId))
        .limit(1);

      const mktMessages = await db
        .select({
          id: messages.id,
          body: messages.body,
          senderId: messages.senderId,
          status: messages.status,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, reportedConvId))
        .orderBy(asc(messages.createdAt));

      reportedConvThread = {
        messages: mktMessages,
        buyerName: buyer?.name ?? null,
        sellerName: seller?.name ?? null,
        buyerId: mktConv.buyerId,
        sellerId: mktConv.sellerId,
        listingTitle: listing?.title ?? null,
      };
    }
  }

  const initialMessages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, id))
    .orderBy(asc(supportMessages.createdAt));

  const isAssignedToMe = conv.assignedTo === myId;
  const isUnassigned = !conv.assignedTo;
  const canClaim = conv.status === "open" && (isUnassigned || role === "admin");
  const isBanned = targetUser?.bannedUntil && targetUser.bannedUntil > new Date();

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Conversation panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin/suport" className="text-gray-400 hover:text-gray-700 transition-colors">
            ←
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{conv.subject}</p>
            <p className="text-sm text-gray-500">
              {targetUser?.name ?? "Utilizator"} — {targetUser?.email}
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
          currentUserId={myId}
          initialMessages={initialMessages}
          convUserId={conv.userId}
          convUserName={targetUser?.name ?? undefined}
        />

        {conv.status === "closed" ? (
          <p className="text-center text-gray-400 text-sm py-3">Conversație închisă.</p>
        ) : (
          <SupportInput conversationId={id} />
        )}
      </div>

      {/* Context sidebar */}
      <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
        {/* User info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Utilizator</h3>
          <p className="font-medium text-gray-900">{targetUser?.name ?? "—"}</p>
          <p className="text-xs text-gray-500 mt-0.5">{targetUser?.email}</p>
          <p className="text-xs text-gray-400 mt-1">
            Înregistrat: {targetUser?.createdAt ? formatDate(targetUser.createdAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}
          </p>
          {isBanned && (
            <p className="text-xs text-amber-600 mt-1 font-medium">
              Suspendat până la: {targetUser!.bannedUntil!.toLocaleDateString("ro-RO")}
            </p>
          )}
          {targetUser?.deletedAt && (
            <p className="text-xs text-red-500 mt-1 font-medium">Cont șters</p>
          )}
        </div>

        {/* Report history */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">
            Rapoarte ({reports.length})
          </h3>
          {reports.length === 0 ? (
            <p className="text-xs text-gray-400">Niciun raport.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="text-xs border-l-2 border-gray-200 pl-2">
                  <span className={`font-medium ${
                    r.status === "pending" ? "text-amber-600" :
                    r.status === "reviewed" ? "text-green-600" : "text-gray-400"
                  }`}>
                    {r.status === "pending" ? "În așteptare" : r.status === "reviewed" ? "Revizuit" : "Respins"}
                  </span>
                  <p className="text-gray-500 line-clamp-2 mt-0.5">{r.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reported marketplace conversation thread */}
        {reportedConvThread && (
          <div className="bg-white rounded-xl border border-amber-200 p-4">
            <h3 className="font-semibold text-gray-700 mb-1 text-sm">Conversație raportată</h3>
            {reportedConvThread.listingTitle && (
              <p className="text-xs text-gray-400 mb-3 truncate">
                Re: {reportedConvThread.listingTitle}
              </p>
            )}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {reportedConvThread.messages.length === 0 ? (
                <p className="text-xs text-gray-400">Niciun mesaj.</p>
              ) : (
                reportedConvThread.messages.map((msg) => {
                  const senderName =
                    msg.senderId === reportedConvThread!.buyerId
                      ? (reportedConvThread!.buyerName ?? "Cumpărător")
                      : (reportedConvThread!.sellerName ?? "Vânzător");
                  const isFlagged = msg.status === "flagged";
                  return (
                    <div key={msg.id} className={`text-xs rounded-lg p-2 ${isFlagged ? "bg-red-50 border border-red-200" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-gray-700">{senderName}</span>
                        {isFlagged && (
                          <span className="text-red-500 text-xs">⚠️ blocat</span>
                        )}
                        <span className="text-gray-400 text-[10px]">
                          {msg.createdAt ? msgFmt.format(new Date(msg.createdAt)) : ""}
                        </span>
                      </div>
                      <p className="text-gray-600 whitespace-pre-wrap break-words">{msg.body}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <AdminSupportActions
          convId={id}
          targetUserId={conv.userId}
          isAssignedToMe={isAssignedToMe}
          canClaim={canClaim}
          isOpen={conv.status === "open"}
          isBanned={!!isBanned}
          isDeleted={!!targetUser?.deletedAt}
          isAdmin={role === "admin"}
          pendingReportId={reports.find((r) => r.status === "pending")?.id}
        />
      </div>
    </div>
  );
}
