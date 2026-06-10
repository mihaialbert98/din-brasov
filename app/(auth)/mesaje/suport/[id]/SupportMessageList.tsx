"use client";

import SharedMessageList from "@/components/shared/MessageList";

type Msg = {
  id: string;
  body: string;
  senderId: string;
  createdAt: Date | string | null;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  initialMessages: Msg[];
  convUserId?: string;
  convUserName?: string;
};

export default function SupportMessageList({
  conversationId,
  currentUserId,
  initialMessages,
  convUserId,
  convUserName,
}: Props) {
  return (
    <SharedMessageList
      conversationId={conversationId}
      currentUserId={currentUserId}
      initialMessages={initialMessages}
      apiUrl={`/api/support/conversations/${conversationId}/messages`}
      refreshKey="refreshSupportMessages"
      getSenderLabel={(msg) =>
        convUserId && msg.senderId === convUserId
          ? (convUserName ?? "Utilizator")
          : "Echipa suport"
      }
    />
  );
}
