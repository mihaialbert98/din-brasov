"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Msg = {
  id: string;
  body: string;
  senderId: string;
  createdAt: Date | string | null;
  status?: string;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  initialMessages: Msg[];
  apiUrl: string;       // endpoint to poll for new messages
  refreshKey: string;   // window.__<refreshKey> exposed for input to call after send
  // Optional sender labels for non-"mine" messages
  getSenderLabel?: (msg: Msg) => string | null; // return null to show no label
  emptyText?: string;
};

const fmt = new Intl.DateTimeFormat("ro-RO", {
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

export default function MessageList({
  conversationId,
  currentUserId,
  initialMessages,
  apiUrl,
  refreshKey,
  getSenderLabel,
  emptyText = "Niciun mesaj încă.",
}: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(initialMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<string>(initialMessages.at(-1)?.id ?? "");

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data?.length) return;
      const newest = data.at(-1)?.id;
      if (newest && newest !== latestIdRef.current) {
        latestIdRef.current = newest;
        setMsgs(data);
      }
    } catch {
      // network hiccup — retry on next poll
    }
  }, [apiUrl]);

  useEffect(() => {
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    (window as any)[`__${refreshKey}`] = fetchMessages;
    return () => { delete (window as any)[`__${refreshKey}`]; };
  }, [fetchMessages, refreshKey]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto space-y-3 mb-4 bg-white rounded-2xl shadow-sm border border-[#e8d9c5] p-4">
      {msgs.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm">{emptyText}</p>
      ) : (
        msgs.map((msg) => {
          const isMine = msg.senderId === currentUserId;
          const senderLabel = !isMine && getSenderLabel ? getSenderLabel(msg) : null;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isMine
                  ? "bg-[#c84b1e] text-white rounded-tr-sm"
                  : "bg-gray-100 text-gray-800 rounded-tl-sm"
              }`}>
                {senderLabel && (
                  <p className="text-xs font-semibold mb-1 text-gray-500">{senderLabel}</p>
                )}
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
