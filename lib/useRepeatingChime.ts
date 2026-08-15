"use client";

import { useEffect } from "react";
import { playChime } from "@/lib/chime";

/** How often an unhandled item re-announces itself. */
export const NUDGE_INTERVAL_MS = 15000;

/**
 * Keep nudging staff while something is waiting on them.
 *
 * A single chime when the item arrives is easy to miss in a busy room — the waiter
 * is at a table, the tablet is across the counter — and then the guest waits. While
 * `active` is true this replays the chime every `intervalMs` until they act on it.
 *
 * Deliberately sound-only: the OS notification still fires once, when the item
 * genuinely arrives. Re-raising that every 15 seconds would be spam, and the
 * notification's `tag` coalesces repeats anyway.
 *
 * The first nudge lands one full interval AFTER activation, because the arrival
 * itself already chimed — so there's no double-chime at t=0. Stops the moment
 * `active` goes false (the item was accepted) and on unmount.
 */
/**
 * Should an open service request keep nudging? Always — a table is waiting on a
 * human, whatever the restaurant's settings.
 */
export function serviceNeedsNudge(openRequests: number): boolean {
  return openRequests > 0;
}

/**
 * Should a pending reservation keep nudging?
 *
 * ONLY when the restaurant confirms manually. On auto-confirm the booking is already
 * accepted and nothing is waiting on staff, so a chime every 15 seconds would be
 * noise they'd learn to ignore — which would then cost them the service alerts too.
 */
export function reservationsNeedNudge(manualConfirm: boolean, pending: number): boolean {
  return manualConfirm && pending > 0;
}

/** Public path of the timer worker (see the file for why a worker is used). */
export const NUDGE_WORKER_PATH = "/nudge-worker.js";

export function useRepeatingChime(active: boolean, intervalMs: number = NUDGE_INTERVAL_MS): void {
  useEffect(() => {
    if (!active) return;

    // The timer lives in a Web Worker because browsers throttle page timers on a
    // backgrounded tab — which is how the tablet sits for most of a service. The
    // worker can't play audio itself, so it just posts a tick and we chime here.
    let worker: Worker | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;

    const startFallback = () => {
      if (fallback === null) fallback = setInterval(() => playChime(), intervalMs);
    };

    if (typeof Worker !== "undefined") {
      try {
        const w = new Worker(NUDGE_WORKER_PATH);
        w.onmessage = () => playChime();
        // A missing or blocked worker fails asynchronously — without this the nudge
        // would go silent with no sign of it, which is worse than not having it.
        w.onerror = () => {
          w.terminate();
          worker = null;
          startFallback();
        };
        w.postMessage({ type: "start", intervalMs });
        worker = w;
      } catch {
        worker = null;
      }
    }
    if (!worker) startFallback();

    return () => {
      if (worker) {
        worker.postMessage({ type: "stop" });
        worker.terminate();
      }
      if (fallback !== null) clearInterval(fallback);
    };
  }, [active, intervalMs]);
}
