import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Main message (e.g. "Nu am găsit anunțuri."). */
  message: string;
  /** Optional secondary line. */
  hint?: string;
  /** Lucide icon element; defaults to an inbox glyph. */
  icon?: React.ReactNode;
  /** Optional action (e.g. a link/button). */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Consistent empty state for the public grids. Replaces the scattered inline
 * `<p className="text-gray-500 text-center py-20">` messages with a calmer,
 * icon-led block that matches the editorial tone.
 */
export default function EmptyState({ message, hint, icon, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center text-center py-20 px-4", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream/60 text-accent/70">
        {icon ?? <Inbox className="h-7 w-7" aria-hidden />}
      </div>
      <p className="text-lg font-medium text-ink">{message}</p>
      {hint && <p className="mt-1.5 text-sm text-muted max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
