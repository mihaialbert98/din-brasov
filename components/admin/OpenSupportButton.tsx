"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  subject?: string;
  label?: string;
  className?: string;
};

export function OpenSupportButton({
  userId,
  subject,
  label = "Deschide suport",
  className = "text-xs bg-[#1a1a1a] text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/admin/support/open-for-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subject }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.conversationId) {
      router.push(`/admin/suport/${data.conversationId}`);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? "..." : label}
    </button>
  );
}
