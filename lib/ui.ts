/**
 * Shared UI class-string primitives for the public site. Centralizing the card
 * shell here means every section card (news, events, places, listings,
 * experiences) shares ONE surface/radius/border/hover treatment — restyle once,
 * all of them follow. Compose with `cn()` (clsx + tailwind-merge) so callers can
 * append or override individual utilities.
 */
import { cn } from "@/lib/utils";

/**
 * The canonical card surface for the public grids. Warm white surface, a hairline
 * border (not a heavy shadow), generous radius, and a subtle on-brand hover lift
 * (`.card-lift` handles the transform + shadow transition, defined in globals.css).
 * Pass `extra` to add layout utilities (padding, flex, overflow) per card.
 */
export function cardShell(extra?: string) {
  return cn(
    "group block bg-surface rounded-2xl border border-hairline",
    "shadow-[0_1px_2px_rgba(31,27,24,0.04)] hover:shadow-[0_8px_24px_rgba(31,27,24,0.08)]",
    "card-lift overflow-hidden",
    extra
  );
}

/** Cover-image aspect frame shared by cards (uniform 3:2 crop). */
export const cardImageFrame =
  "relative w-full aspect-[3/2] overflow-hidden bg-cream/40";

/** Image zoom-on-hover (paired with a `group` ancestor). Kept subtle. */
export const cardImageZoom =
  "object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]";

/** Neutral fallback tile for cards with no image (icon centered on a cream wash). */
export const cardImageFallback =
  "w-full aspect-[3/2] bg-gradient-to-br from-cream/70 to-accent-soft flex items-center justify-center text-accent/50";

/** Small uppercase eyebrow used above card titles (source name, kicker). */
export const eyebrow =
  "text-xs font-semibold uppercase tracking-[0.08em] text-accent";
