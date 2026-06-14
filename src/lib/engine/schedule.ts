import { freeIntervalsFrom } from "./time";
import type {
  Block,
  Minute,
  RoutineItem,
  ScheduleResult,
  Settings,
  Warning,
} from "./types";

/** Round-robin interleave per-exercise blocks so the same exercise isn't clustered. */
function interleaveByExercise(blocks: Block[]): Block[] {
  const queues = new Map<string, Block[]>();
  for (const b of blocks) {
    const q = queues.get(b.exerciseId);
    if (q) q.push(b);
    else queues.set(b.exerciseId, [b]);
  }
  const lists = [...queues.values()];
  const out: Block[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const list of lists) {
      const next = list.shift();
      if (next) {
        out.push(next);
        progressed = true;
      }
    }
  }
  return out;
}

/** Sort comparator by scheduled time; unscheduled (-1) blocks sink to the bottom. */
function byTime(a: Block, b: Block): number {
  const ta = a.time < 0 ? Number.POSITIVE_INFINITY : a.time;
  const tb = b.time < 0 ? Number.POSITIVE_INFINITY : b.time;
  return ta - tb;
}

/**
 * Re-place every movable (pending/snoozed) block across the free time from `now`,
 * keeping done/skipped blocks fixed. Blocks are spread evenly across the remaining
 * window, never closer than `minRest`, skipping avoid windows. Blocks that don't fit
 * come back with time = -1 and are reported as an overflow warning.
 *
 * Pure and deterministic: same (blocks, settings, now) always yields the same result.
 */
export function reschedule(
  blocks: Block[],
  settings: Settings,
  now: Minute,
): ScheduleResult {
  const fixed = blocks.filter(
    (b) => b.status === "done" || b.status === "skipped",
  );
  const movable = blocks.filter(
    (b) => b.status === "pending" || b.status === "snoozed",
  );

  if (movable.length === 0) {
    return { blocks: [...fixed].sort(byTime), warnings: [] };
  }

  // Order: priority desc, then earliest asc, with round-robin interleave as the
  // stable tiebreak (so the same exercise isn't scheduled back to back).
  const interleaved = interleaveByExercise(movable);
  const ordered = interleaved
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const pri = (y.b.priority ?? 0) - (x.b.priority ?? 0);
      if (pri !== 0) return pri;
      const earliest = (x.b.earliest ?? 0) - (y.b.earliest ?? 0);
      if (earliest !== 0) return earliest;
      return x.i - y.i;
    })
    .map((x) => x.b);

  const free = freeIntervalsFrom(now, settings);
  const placed: Block[] = [];
  const overflow: Block[] = [];

  if (free.length === 0) {
    for (const b of ordered) overflow.push({ ...b, time: -1 });
  } else {
    const windowEnd = settings.workWindow.end;
    // Don't schedule within minRest of the most recent fixed (done/skipped) block.
    const lastFixed = fixed.reduce((max, b) => (b.time > max ? b.time : max), -1);
    let cursor = free[0].start;
    if (lastFixed >= 0) cursor = Math.max(cursor, lastFixed + settings.minRest);

    const span = Math.max(0, windowEnd - cursor);
    const spacing = Math.max(
      settings.minRest,
      Math.floor(span / ordered.length),
    );

    let fi = 0; // index into free intervals
    for (const b of ordered) {
      cursor = Math.max(cursor, b.earliest ?? 0);
      // advance to the free interval that could contain the cursor
      while (fi < free.length && cursor >= free[fi].end) fi++;
      if (fi < free.length && cursor < free[fi].start) cursor = free[fi].start;

      if (fi >= free.length || cursor >= windowEnd) {
        overflow.push({ ...b, time: -1 });
        continue;
      }
      placed.push({ ...b, time: cursor });
      cursor += spacing;
    }
  }

  const warnings: Warning[] = [];
  if (overflow.length > 0) {
    const endH = Math.floor(settings.workWindow.end / 60);
    warnings.push({
      type: "overflow",
      message: `${overflow.length} bloque(s) no entran antes de las ${endH}:00.`,
      blockIds: overflow.map((b) => b.id),
    });
  }

  return { blocks: [...fixed, ...placed, ...overflow].sort(byTime), warnings };
}

/** Materialize one block per set from a routine, then schedule them across the day. */
export function createDayPlan(
  routine: RoutineItem[],
  settings: Settings,
  now: Minute,
): ScheduleResult {
  const blocks: Block[] = [];
  for (const item of routine) {
    for (let s = 0; s < item.sets; s++) {
      blocks.push({
        id: `${item.exerciseId}#${s + 1}`,
        exerciseId: item.exerciseId,
        name: item.name,
        sets: 1,
        time: -1,
        status: "pending",
        priority: item.priority ?? 0,
      });
    }
  }
  return reschedule(blocks, settings, now);
}

/** Mark a block done (fixed at `now`) and reschedule the rest. */
export function markDone(
  blocks: Block[],
  blockId: string,
  settings: Settings,
  now: Minute,
): ScheduleResult {
  const updated = blocks.map((b) =>
    b.id === blockId ? { ...b, status: "done" as const, time: now } : b,
  );
  return reschedule(updated, settings, now);
}

/** "Ahora no puedo" — keep the set pending but not before now + minRest, then reschedule. */
export function decline(
  blocks: Block[],
  blockId: string,
  settings: Settings,
  now: Minute,
): ScheduleResult {
  const updated = blocks.map((b) =>
    b.id === blockId
      ? { ...b, status: "pending" as const, earliest: now + settings.minRest }
      : b,
  );
  return reschedule(updated, settings, now);
}

/** Snooze a block by `minutes`, then reschedule. */
export function snooze(
  blocks: Block[],
  blockId: string,
  minutes: number,
  settings: Settings,
  now: Minute,
): ScheduleResult {
  const updated = blocks.map((b) =>
    b.id === blockId
      ? { ...b, status: "snoozed" as const, earliest: now + minutes }
      : b,
  );
  return reschedule(updated, settings, now);
}

/** Skip a block entirely (won't do it today) and reschedule the rest. */
export function skip(
  blocks: Block[],
  blockId: string,
  settings: Settings,
  now: Minute,
): ScheduleResult {
  const updated = blocks.map((b) =>
    b.id === blockId ? { ...b, status: "skipped" as const, time: now } : b,
  );
  return reschedule(updated, settings, now);
}
