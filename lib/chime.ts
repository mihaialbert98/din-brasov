/**
 * Notification chime for the live staff boards (Serviciu / Rezervări).
 * A longer, repeating three-pulse tone (~1.2s) so a busy waiter doesn't miss it —
 * replaces the old single 0.3s beep. Synthesized via WebAudio so there's no asset
 * to load and no autoplay-file issues. Silently no-ops if audio isn't permitted
 * yet (browsers block sound until the first user interaction on the page).
 */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    // Three ascending pulses, ~0.35s each with a short gap → ~1.2s total.
    const notes = [880, 988, 1175]; // A5, B5, D6
    const pulse = 0.35;
    const gap = 0.05;

    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * (pulse + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      // Quick attack, gentle decay per pulse.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + pulse);
      osc.start(start);
      osc.stop(start + pulse);
    });

    // Close the context after the chime finishes to free resources.
    setTimeout(() => ctx.close().catch(() => {}), (pulse + gap) * notes.length * 1000 + 200);
  } catch {
    /* audio not allowed until user interaction — ignore */
  }
}

/** Whether the browser supports the Notification API. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current permission state, or "unsupported". */
export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Ask the user to allow notifications. Returns the resulting permission. */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Alert staff about a new item: always play the chime (heard when the tab is
 * focused), and — when the tab is NOT the active one and permission is granted —
 * also raise an OS notification so a waiter looking at another tab still gets it.
 * Clicking the notification focuses the board tab.
 */
export function notify(opts: { title: string; body?: string }): void {
  playChime();

  // Only bother with an OS notification when the page isn't the visible one —
  // if the board is in front, the chime + on-screen badge already cover it.
  const hidden = typeof document !== "undefined" && document.visibilityState !== "visible";
  if (!hidden) return;
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      // A stable tag coalesces rapid repeats into one popup instead of stacking.
      tag: "din-brasov-staff",
      renotify: true,
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* notification failed — the chime already fired */
  }
}
