"use client";

import { MessageInput } from "@/components/shared/MessageInput";

export default function SupportInput({ conversationId }: { conversationId: string }) {
  return (
    <MessageInput
      apiUrl={`/api/support/conversations/${conversationId}/messages`}
      refreshKey="refreshSupportMessages"
    />
  );
}
