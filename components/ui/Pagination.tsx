import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

const arrowClass =
  "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-hairline text-muted hover:bg-cream/40 hover:text-ink transition-colors";

export default function Pagination({ currentPage, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-10" aria-label="Paginare">
      {currentPage > 1 && (
        <Link href={buildHref(currentPage - 1)} className={arrowClass} aria-label="Pagina anterioară">
          <ChevronLeft className="w-4 h-4" aria-hidden />
        </Link>
      )}
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-faint text-sm">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={`inline-flex items-center justify-center min-w-9 h-9 px-3 text-sm rounded-lg border transition-colors tabular-nums ${
              p === currentPage
                ? "bg-accent text-white border-accent font-semibold"
                : "border-hairline text-muted hover:bg-cream/40 hover:text-ink"
            }`}
          >
            {p}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link href={buildHref(currentPage + 1)} className={arrowClass} aria-label="Pagina următoare">
          <ChevronRight className="w-4 h-4" aria-hidden />
        </Link>
      )}
    </nav>
  );
}
