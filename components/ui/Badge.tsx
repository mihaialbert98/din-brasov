import { cn } from "@/lib/utils";
import { categoryTint } from "@/lib/categories";

type Variant = "category" | "accent" | "neutral" | "onImage";

const VARIANTS: Record<Exclude<Variant, "category">, string> = {
  accent: "bg-accent text-white",
  neutral: "bg-cream/50 text-ink/70",
  onImage: "bg-white/90 text-ink backdrop-blur-sm shadow-sm",
};

type Props = {
  children: React.ReactNode;
  /** "category" auto-tints by label (see lib/categories.ts). */
  variant?: Variant;
  /** Category name — used only when variant="category". */
  category?: string | null;
  /** Optional leading icon (Lucide element). */
  icon?: React.ReactNode;
  className?: string;
};

/**
 * One consistent pill for the whole public site — category chips, "Promovat"
 * accent tags, "on image" overlays. Replaces the four divergent badge schemes
 * that were hardcoded across the cards.
 */
export default function Badge({ children, variant = "category", category, icon, className }: Props) {
  const tint = variant === "category" ? categoryTint(category) : VARIANTS[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap",
        tint,
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
