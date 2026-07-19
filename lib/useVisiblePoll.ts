"use client";

import { useEffect, useRef } from "react";

/**
 * Poll a callback on an interval that adapts to tab visibility, to keep the live
 * staff boards fresh without wasting requests on backgrounded tabs.
 *
 * - Visible tab → polls every `visibleMs`.
 * - Hidden/minimized tab → polls every `hiddenMs` (slower; still fires so the
 *   background OS notification keeps working, just less often).
 * - On becoming visible again → polls once immediately, then resumes the fast
 *   cadence (so a returning waiter sees fresh data at once).
 *
 * The callback always runs once on mount. `fn` is kept in a ref so changing it
 * between renders doesn't reset the timer.
 */
export function useVisiblePoll(fn: () => void, visibleMs: number, hiddenMs: number): void {
  const fnRef = useRef(fn);
  // Keep the ref pointing at the latest callback without resetting the timer.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      fnRef.current();
      const delay = typeof document !== "undefined" && document.hidden ? hiddenMs : visibleMs;
      timer = setTimeout(tick, delay);
    };

    // Run once immediately, then schedule.
    fnRef.current();
    timer = setTimeout(tick, typeof document !== "undefined" && document.hidden ? hiddenMs : visibleMs);

    // On refocus, poll now and restart the cadence from the fast interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        fnRef.current();
        timer = setTimeout(tick, visibleMs);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [visibleMs, hiddenMs]);
}
