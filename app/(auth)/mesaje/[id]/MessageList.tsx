"use client";

import SharedMessageList from "@/components/shared/MessageList";

type Props = {
  conversationId: string;
  currentUserId: string;
  initialMessages: { id: string; body: string; senderId: string; createdAt: Date | string | null }[];
};

export default function MessageList({ conversationId, currentUserId, initialMessages }: Props) {
  return (
    <SharedMessageList
      conversationId={conversationId}
      currentUserId={currentUserId}
      initialMessages={initialMessages}
      apiUrl={`/api/conversations/${conversationId}/messages`}
      refreshKey="refreshMessages"
      emptyText="Niciun mesaj încă. Fii primul care scrie!"
    />
  );
}
