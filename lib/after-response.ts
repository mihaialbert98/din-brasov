import { after } from "next/server";

/**
 * Run best-effort background work (sending an email) so it survives the response.
 *
 * `void work()` is NOT safe on Vercel. Once the handler returns, the serverless
 * invocation can be frozen or torn down, and any promise still in flight is simply
 * dropped — the HTTP request to Resend never leaves. It is non-deterministic: the
 * same code completes every time locally, and intermittently in production. That is
 * exactly how confirmation emails went missing (13 Aug 2026) while the cancellation
 * email — which happened to win the race — went out fine.
 *
 * `after()` is Next's supported way to schedule post-response work; Vercel keeps the
 * invocation alive until it finishes, and it adds no latency to the response.
 *
 * Outside a request scope — cron scripts, tests — `after()` throws, so the work is
 * awaited instead. Callers should therefore `await` this: it resolves immediately in
 * the request path, and genuinely waits everywhere else.
 */
export async function runAfterResponse(work: () => Promise<unknown>): Promise<void> {
  try {
    after(work);
  } catch {
    // Not inside a request — run it here so it still happens.
    await work().catch(() => {});
  }
}
