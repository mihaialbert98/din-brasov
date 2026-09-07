"use client";

type Props = {
  title?: string;
  description: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  title = "Confirmare ștergere",
  description,
  confirmLabel = "Șterge",
  loading = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Every modal panel in the app carries these three, and the reason is worth
          knowing: the overlay is `fixed inset-0`, so a panel taller than the window is
          simply CLIPPED — the page behind it cannot scroll to reveal the rest, and on a
          short laptop screen the panel's own top goes off the top of the viewport. The cap
          is 100dvh (dynamic viewport height, which follows mobile browser chrome as it
          hides) minus the overlay's p-4 top and bottom. `overscroll-contain` stops a scroll
          that reaches the panel's end from chaining to the page underneath.
          scripts/test-modal-scroll.ts asserts no modal is ever added without them. */}
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Anulează
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Se șterge..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
