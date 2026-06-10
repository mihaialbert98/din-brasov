"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  convId: string;
  targetUserId: string;
  isAssignedToMe: boolean;
  canClaim: boolean;
  isOpen: boolean;
  isBanned: boolean;
  isDeleted: boolean;
  isAdmin: boolean;
  pendingReportId?: string;
};

export default function AdminSupportActions({
  convId,
  targetUserId,
  isAssignedToMe,
  canClaim,
  isOpen,
  isBanned,
  isDeleted,
  isAdmin,
  pendingReportId,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [showBanForm, setShowBanForm] = useState(false);
  const [banDays, setBanDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: object) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  }

  async function handleClaim() {
    setLoading("claim");
    await post(`/api/admin/support/${convId}/claim`, {});
    router.refresh();
    setLoading(null);
  }

  async function handleClose() {
    if (!confirm("Închide această conversație?")) return;
    setLoading("close");
    await post(`/api/admin/support/${convId}/close`, {});
    router.refresh();
    setLoading(null);
  }

  async function handleBan() {
    setLoading("ban");
    setError(null);
    const res = await post(`/api/admin/users/${targetUserId}/ban`, {
      days: banDays,
      reportId: pendingReportId,
      reason: banReason.trim() || undefined,
    });
    setLoading(null);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Eroare.");
      return;
    }
    setShowBanForm(false);
    router.refresh();
  }

  async function handleDismiss() {
    if (!pendingReportId) return;
    setLoading("dismiss");
    await post(`/api/admin/users/${targetUserId}/warn`, {
      reportId: pendingReportId,
    });
    router.refresh();
    setLoading(null);
  }

  async function handleDelete() {
    if (!confirm("Ștergi contul acestui utilizator? Acțiune ireversibilă!")) return;
    setLoading("delete");
    await post(`/api/admin/users/${targetUserId}/delete`, {
      reportId: pendingReportId,
    });
    router.refresh();
    setLoading(null);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="font-semibold text-gray-700 text-sm">Acțiuni</h3>

      {canClaim && !isAssignedToMe && (
        <button
          onClick={handleClaim}
          disabled={!!loading}
          className="w-full bg-[#1a1a1a] text-white text-sm font-medium py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {loading === "claim" ? "Se preia..." : "Preia conversația"}
        </button>
      )}

      {isOpen && (
        <button
          onClick={handleClose}
          disabled={!!loading}
          className="w-full border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {loading === "close" ? "Se închide..." : "Închide conversația"}
        </button>
      )}

      {!isDeleted && (
        <>
          {!showBanForm ? (
            <button
              onClick={() => setShowBanForm(true)}
              disabled={!!loading}
              className="w-full bg-amber-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {isBanned ? "Modifică suspendarea" : "Suspendă cont"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                {[7, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setBanDays(d)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                      banDays === d
                        ? "bg-amber-500 text-white border-amber-500"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {d} zile
                  </button>
                ))}
              </div>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Motivul suspendării (opțional)"
                rows={2}
                style={{ color: "#1a1a1a", backgroundColor: "#fff", colorScheme: "light" }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-[#c84b1e]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBanForm(false)}
                  className="flex-1 text-xs border border-gray-300 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  Anulează
                </button>
                <button
                  onClick={handleBan}
                  disabled={!!loading}
                  className="flex-1 text-xs bg-amber-500 text-white py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-60"
                >
                  {loading === "ban" ? "..." : "Confirmă"}
                </button>
              </div>
            </div>
          )}

          {pendingReportId && (
            <button
              onClick={handleDismiss}
              disabled={!!loading}
              className="w-full border border-gray-300 text-gray-500 text-sm py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {loading === "dismiss" ? "..." : "Respinge raport"}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={!!loading}
              className="w-full bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {loading === "delete" ? "Se șterge..." : "Șterge cont (GDPR)"}
            </button>
          )}
        </>
      )}

      {error && (
        <p className="text-red-600 text-xs">{error}</p>
      )}
    </div>
  );
}
