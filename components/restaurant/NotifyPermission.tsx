"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { notificationPermission, requestNotificationPermission } from "@/lib/chime";

/**
 * Small opt-in banner on the staff boards: lets a waiter/owner enable OS
 * notifications so a new request/reservation alerts them even when they're on
 * another browser tab or the browser is minimized. When still "default" it
 * prompts to enable; once granted it shows a short reminder to keep the page open
 * (alerts stop if the tab is closed — they don't require the tab to be in front).
 */
export default function NotifyPermission() {
  const [state, setState] = useState<NotificationPermission | "unsupported" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setState(notificationPermission());
  }, []);

  if (dismissed || state === null || state === "denied" || state === "unsupported") {
    return null;
  }

  // Permission granted → remind them the tab must stay open (minimized is fine).
  if (state === "granted") {
    return (
      <div className="mb-4 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
        <Bell className="w-4 h-4 text-[#3a7fa0] flex-shrink-0" aria-hidden />
        <p className="text-xs text-gray-600 flex-1">
          Notificări active. Ține această pagină deschisă ca să primești alerte — poți minimiza fereastra
          sau folosi alt tab, dar nu închide pagina.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-700 flex-shrink-0"
          aria-label="Închide"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    );
  }

  // Permission still "default" → prompt to enable.
  return (
    <div className="mb-4 flex items-center gap-3 bg-[#6bb5d4]/10 border border-[#6bb5d4]/40 rounded-xl px-4 py-3">
      <Bell className="w-5 h-5 text-[#3a7fa0] flex-shrink-0" aria-hidden />
      <p className="text-sm text-gray-700 flex-1">
        Activează notificările ca să fii anunțat de cereri noi chiar și când ești pe alt tab sau cu
        fereastra minimizată. Ține pagina deschisă ca să funcționeze.
      </p>
      <button
        onClick={async () => setState(await requestNotificationPermission())}
        className="text-sm font-semibold bg-[#c84b1e] text-white px-3 py-1.5 rounded-lg hover:bg-[#d9603a] transition-colors flex-shrink-0"
      >
        Activează
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-400 hover:text-gray-700 flex-shrink-0"
        aria-label="Închide"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}
