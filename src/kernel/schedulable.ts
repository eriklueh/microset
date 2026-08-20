/**
 * KERNEL · Contract 1 — Schedulable (plataforma BASE — ver docs/VISION.md §4).
 *
 * Anything the pure day-bounded engine can place on a day. Pausa micro-blocks (spread
 * mode), Entreno sessions (clustered/windowed mode) and Nutrición meals (fixed times)
 * all implement it, so the SAME engine schedules all three.
 *
 * Fase 0: the shape only. The engine keeps consuming its own RoutineItem/Block types
 * until a module actually needs to be scheduled through this contract.
 */
export type ScheduleStatus = "pending" | "done" | "skipped" | "snoozed" | "partial";

export interface Schedulable {
  /** `YYYY-M-D` (matches the store's todayKey). */
  date: string;
  /** Minutes-of-day, or null when not yet placed. */
  time: number | null;
  /** Optional bounding window (minutes-of-day) for windowed/clustered placement. */
  window?: { start: number; end: number };
  status: ScheduleStatus;
  /** Earliest minute-of-day it may be placed. */
  earliest?: number;
  /** Tiebreak for ordering within a day (lower = earlier). */
  priority?: number;
}
