import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  /** Optional right-aligned action (e.g. the "Adaugă anunț" button). */
  action?: React.ReactNode;
  /** Small uppercase kicker above the title (e.g. "Comunitate"). */
  kicker?: string;
  className?: string;
};

/**
 * The shared header for every public list/section page. Serif (Lora) ink title
 * with a short accent rule beneath it — the editorial, on-brand replacement for
 * the five duplicated `text-[#1a4731] font-serif` headers. When `action` is
 * passed, the title and action sit on one row (used by Anunțuri).
 */
export default function PageHeader({ title, subtitle, action, kicker, className }: Props) {
  return (
    <header className={cn("mb-8", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {kicker && (
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent mb-2">
              {kicker}
            </p>
          )}
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink leading-tight">
            {title}
          </h1>
        </div>
        {action && <div className="flex-shrink-0 pt-1">{action}</div>}
      </div>
      {/* Short accent rule — a quiet editorial flourish, not a full underline. */}
      <div className="mt-3 h-1 w-12 rounded-full bg-accent" aria-hidden />
      {subtitle && <p className="mt-4 text-base text-muted max-w-2xl">{subtitle}</p>}
    </header>
  );
}
