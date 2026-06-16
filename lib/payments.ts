/**
 * Payments feature flag.
 *
 * Off by default — paid actions (3rd+ listing, boost) are disabled until a
 * bank account / Netopia live account is ready. Flip the env var to "true"
 * (per environment in Vercel) to re-enable, no code change needed.
 *
 * NEXT_PUBLIC_ prefix → readable in both server routes and client components.
 */
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
