"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Message = {
  id: string;
  body: string;
  senderId: string;
  createdAt: Date | string | null;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
};

const fmt = new Intl.DateTimeFormat("ro-RO", {
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

export default function MessageList({ conversationId, currentUserId, initialMessages }: Props) {
  const [msgs, setMsgs] = useState<Message[]>(initialMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<string>(initialMessages.at(-1)?.id ?? "");

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data?.length) return;
      const newest = data.at(-1)?.id;
      if (newest && newest !== latestIdRef.current) {
        latestIdRef.current = newest;
        setMsgs(data);
      }
    } catch {
      // network hiccup — ignore, next poll will retry
    }
  }, [conversationId]);

  // Poll every 3 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Scroll the container to the bottom when messages change
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Expose refresh so ConversationInput can call it after sending
  useEffect(() => {
    (window as any).__refreshMessages = fetchMessages;
    return () => { delete (window as any).__refreshMessages; };
  }, [fetchMessages]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto space-y-3 mb-4 bg-white rounded-2xl shadow-sm border border-[#e8d9c5] p-4">
      {msgs.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm">
          Niciun mesaj încă. Fii primul care scrie!
        </p>
      ) : (
        msgs.map((msg) => {
          const isMine = msg.senderId === currentUserId;
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
                  {msg.createdAt ? fmt.format(new Date(msg.createdAt)) : ""}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
