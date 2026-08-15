/**
 * Timer for the staff-board notification nudge.
 *
 * Why a worker at all: browsers throttle timers on a BACKGROUNDED tab — Chrome can
 * clamp them to roughly once a minute — and a restaurant tablet spends most of
 * service with the board behind something else. A page-side setInterval would
 * silently stretch from 15s to a minute or more, which is exactly when a waiting
 * guest most needs the reminder. Worker timers are not throttled the same way.
 *
 * The worker only keeps time. It cannot play audio (no DOM, no AudioContext), so
 * each tick is posted back and the page plays the chime.
 *
 * Messages in:  { type: "start", intervalMs }  |  { type: "stop" }
 * Messages out: "tick"
 */
let timerId = null;

self.onmessage = (event) => {
  const msg = event.data || {};

  if (msg.type === "start") {
    if (timerId !== null) clearInterval(timerId);
    const ms = typeof msg.intervalMs === "number" && msg.intervalMs > 0 ? msg.intervalMs : 15000;
    timerId = setInterval(() => self.postMessage("tick"), ms);
    return;
  }

  if (msg.type === "stop") {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
  }
};
