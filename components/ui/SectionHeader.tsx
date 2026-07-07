import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Props = {
  title: string;
  /** "See all" link target; when set, renders the right-aligned link. */
  href?: string;
  linkLabel?: string;
};

/**
 * Homepage section header ("Ultimele știri" … "Vezi toate →"). Serif ink title
 * with a short accent tick, and a quiet accent link. Replaces the five
 * copy-pasted homepage section headers with their border-b underlines.
 */
export default function SectionHeader({ title, href, linkLabel = "Vezi toate" }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-ink leading-tight relative pl-4">
        <span className="absolute left-0 top-1 bottom-1 w-1 rounded-full bg-accent" aria-hidden />
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="group inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover transition-colors whitespace-nowrap"
        >
          {linkLabel}
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
