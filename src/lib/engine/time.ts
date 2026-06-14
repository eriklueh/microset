import type { Minute, Settings, TimeWindow } from "./types";

/** Build a Minute from hours/minutes: at(9) === 540, at(13, 30) === 810. */
export const at = (h: number, m: number = 0): Minute => h * 60 + m;

/** Format a Minute as "HH:MM" (or "--:--" when unscheduled). */
export function formatMinute(min: Minute): string {
  if (min < 0) return "--:--";
  const h = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Subtract avoid windows from a window, returning the remaining free sub-intervals. */
export function subtractAvoid(
  window: TimeWindow,
  avoid: TimeWindow[],
): TimeWindow[] {
  let free: TimeWindow[] = [{ start: window.start, end: window.end }];
  for (const a of avoid) {
    const next: TimeWindow[] = [];
    for (const f of free) {
      if (a.end <= f.start || a.start >= f.end) {
        next.push(f); // no overlap
        continue;
      }
      if (a.start > f.start) next.push({ start: f.start, end: a.start });
      if (a.end < f.end) next.push({ start: a.end, end: f.end });
    }
    free = next;
  }
  return free.filter((w) => w.end > w.start);
}

/** Free intervals available from `now` until the end of the work window. */
export function freeIntervalsFrom(now: Minute, settings: Settings): TimeWindow[] {
  const start = Math.max(now, settings.workWindow.start);
  if (start >= settings.workWindow.end) return [];
  return subtractAvoid(
    { start, end: settings.workWindow.end },
    settings.avoidWindows,
  );
}
