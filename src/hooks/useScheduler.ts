import { useEffect } from "react";
import { nowMinutes, useStore } from "@/store/useStore";
import {
  ensureNotificationSetup,
  listenForNotificationActions,
  notifyBlock,
} from "@/lib/notify";

const TICK_MS = 30_000;

/**
 * While the app runs (even hidden in the tray, since the webview stays alive),
 * fire a native notification when a scheduled block becomes due. Respects the
 * user's notification toggle. A block is re-notified only if rescheduled.
 */
export function useScheduler(): void {
  useEffect(() => {
    let cancelled = false;
    const notified = new Set<string>();
    let dayKey = "";

    void (async () => {
      const granted = await ensureNotificationSetup();
      if (cancelled || !granted) return;
      await listenForNotificationActions({
        done: (id) => useStore.getState().done(id),
        snooze: (id) =>
          useStore.getState().snooze(id, useStore.getState().snoozeMinutes),
        decline: (id) => useStore.getState().decline(id),
      });
    })();

    const tick = () => {
      const { day, notificationsEnabled } = useStore.getState();
      if (!day || !notificationsEnabled) return;
      if (day.date !== dayKey) {
        dayKey = day.date;
        notified.clear();
      }
      const now = nowMinutes();
      for (const b of day.blocks) {
        const movable = b.status === "pending" || b.status === "snoozed";
        if (!movable || b.time < 0 || b.time > now) continue;
        const key = `${b.id}@${b.time}`;
        if (notified.has(key)) continue;
        notified.add(key);
        notifyBlock(b);
        break; // at most one reminder per tick
      }
    };

    tick();
    const handle = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);
}
