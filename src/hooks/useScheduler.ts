import { useEffect } from "react";
import { nowMinutes, useStore } from "@/store/useStore";

const TICK_MS = 30_000;

/**
 * While the app runs (even hidden in the tray, since the webview stays alive),
 * pop the custom toast window when a scheduled block becomes due. Respects the
 * notifications toggle, fires one reminder at a time, and re-fires a block only
 * if it's rescheduled to a new time.
 */
export function useScheduler(): void {
  useEffect(() => {
    const notified = new Set<string>();
    let dayKey = "";

    const tick = () => {
      const { day, notificationsEnabled, toastBlockId, showToast } = useStore.getState();
      if (!day || !notificationsEnabled) return;
      if (day.date !== dayKey) {
        dayKey = day.date;
        notified.clear();
      }
      // A reminder is already on screen — don't stack another.
      if (toastBlockId) return;

      const now = nowMinutes();
      for (const b of day.blocks) {
        const movable = b.status === "pending" || b.status === "snoozed";
        if (!movable || b.time < 0 || b.time > now) continue;
        const key = `${b.id}@${b.time}`;
        if (notified.has(key)) continue;
        notified.add(key);
        showToast(b.id);
        break; // at most one reminder per tick
      }
    };

    tick();
    const handle = setInterval(tick, TICK_MS);
    return () => clearInterval(handle);
  }, []);
}
