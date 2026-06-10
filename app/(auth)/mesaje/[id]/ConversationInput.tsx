"use client";

import { MessageInput } from "@/components/shared/MessageInput";

export function ConversationInput({ conversationId }: { conversationId: string }) {
  return (
    <MessageInput
      apiUrl={`/api/conversations/${conversationId}/messages`}
      refreshKey="refreshMessages"
      withAntiSpam={true}
      urlCheck={true}
    />
  );
}
