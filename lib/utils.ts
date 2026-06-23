import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(date));
}

export function formatPrice(amount: string | number | null, currency = "RON") {
  if (!amount) return "Negociabil";
  return `${amount} ${currency}`;
}

export function truncate(str: string, maxLength: number) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/**
 * Hosts whose images we control and have whitelisted in next.config.ts — these
 * can go through the Next.js image optimizer. Everything else (scraped news
 * images from arbitrary source sites) must bypass the optimizer (`unoptimized`),
 * otherwise next/image returns a 400 for un-whitelisted hosts and the image
 * appears broken.
 */
const OPTIMIZABLE_IMAGE_HOSTS = [/\.ufs\.sh$/, /^utfs\.io$/, /^images\.unsplash\.com$/];

/** True if a remote image URL is from a host we optimize; false → render unoptimized. */
export function isOptimizableImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return OPTIMIZABLE_IMAGE_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}
