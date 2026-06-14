/** Minutes since local midnight (0..1439). The engine is timezone-agnostic. */
export type Minute = number;

/** A half-open time range [start, end) in minutes since midnight. */
export interface TimeWindow {
  start: Minute;
  end: Minute;
}

export type BlockStatus = "pending" | "done" | "skipped" | "snoozed";

/** A single chunk of work to do in one micro-break (default: one set of one exercise). */
export interface Block {
  id: string;
  exerciseId: string;
  name: string;
  /** Sets performed in this block (default 1). */
  sets: number;
  /** Scheduled time, minutes since midnight. -1 means unscheduled (didn't fit). */
  time: Minute;
  status: BlockStatus;
  /** Earliest time this block may be scheduled (e.g. after a "not now"). */
  earliest?: Minute;
  /** Higher runs first when the day is tight. Default 0. */
  priority?: number;
}

export interface Settings {
  /** Working window, e.g. { start: 9*60, end: 18*60 }. */
  workWindow: TimeWindow;
  /** Minimum minutes between two consecutive blocks. */
  minRest: Minute;
  /** Ranges to keep clear (lunch, recurring meetings). */
  avoidWindows: TimeWindow[];
}

/** One exercise's target for the day. */
export interface RoutineItem {
  exerciseId: string;
  name: string;
  /** Total sets to spread across the day (one block per set for now). */
  sets: number;
  /** Higher = scheduled first when the day is tight. Default 0. */
  priority?: number;
}

export type Warning = {
  type: "overflow";
  message: string;
  blockIds: string[];
};

export interface ScheduleResult {
  blocks: Block[];
  warnings: Warning[];
}
