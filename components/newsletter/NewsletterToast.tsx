"use client";

/**
 * Surfaces the outcome of newsletter verify/unsubscribe redirects, which land on
 * `/?newsletter=confirmat|dezabonat|eroare`. Shows a toast, then strips the param.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const MESSAGES: Record<string, { text: string; tone: string }> = {
  confirmat: { text: "Abonare confirmată! Mulțumim. 🎉", tone: "bg-green-600" },
  dezabonat: { text: "Te-ai dezabonat. Ne pare rău să te vedem plecând.", tone: "bg-gray-700" },
  eroare: { text: "Link invalid sau expirat. Încearcă din nou.", tone: "bg-red-600" },
};

export function NewsletterToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  const status = searchParams.get("newsletter");

  useEffect(() => {
    if (!status || !MESSAGES[status]) return;
    setMsg(MESSAGES[status]);
    // Strip the param so a refresh doesn't re-trigger.
    router.replace(pathname);
    const timer = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [status, pathname, router]);

  if (!msg) return null;

  return (
    <div
      role="status"
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] ${msg.tone} text-white px-5 py-3 rounded-lg shadow-xl text-sm font-medium max-w-[90vw] text-center`}
    >
      {msg.text}
    </div>
  );
}
