"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export default function DeletePastEventsButton({ count }: { count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events/delete-past", { method: "POST" });
      if (!res.ok) throw new Error();
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Eroare la ștergere. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {confirming && (
        <ConfirmModal
          title="Șterge evenimentele trecute"
          description={
            <>Ștergi <span className="font-semibold">{count} {count === 1 ? "eveniment trecut" : "evenimente trecute"}</span>? Acțiunea este ireversibilă.</>
          }
          confirmLabel="Șterge tot"
          loading={loading}
          error={error}
          onConfirm={handleDelete}
          onCancel={() => { setConfirming(false); setError(null); }}
        />
      )}
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors font-medium"
      >
        Șterge evenimentele trecute ({count})
      </button>
    </>
  );
}
