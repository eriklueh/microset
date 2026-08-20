/**
 * KERNEL · unified activity model (plataforma BASE — ver docs/VISION.md §4).
 *
 * The generalization of microset's append-only `logs:LogEntry[]` stream. Every module
 * writes ActivityEvents here; every cross-cutting LAYER (gamification / social / coach)
 * reads them. The one rule that decouples everything: layers read ONLY the `metrics`
 * envelope, never a module's `payload`.
 *
 * Fase 0 is purely additive — these contracts exist alongside the current store and are
 * not wired into the running app yet. No behavior change.
 */
import type { BodyGroup } from "@/domain/bodyGroups";

export type ModuleId = string;
export type PersonId = string;

/** The device owner. Pausa/Entreno only ever write this; only Nutrición writes household members. */
export const SELF: PersonId = "self";

/**
 * Kernel-owned, all-optional, additive metrics envelope stamped on each event.
 * Cross-cutting layers read ONLY this. Extend it additively; version it independently
 * of any module payload.
 */
export interface ActivityMetrics {
  /** Intrinsic effort of the activity at intensity=1. Day-intensity is applied by the
   *  projection (it depends on the plan and can change after the event was logged). */
  effortXp?: number;
  /** Per body-group effort at intensity=1. */
  muscleXp?: Partial<Record<BodyGroup, number>>;
  volumeLoad?: number;
  durationMin?: number;
  kcal?: number;
  macros?: { protein?: number; carbs?: number; fat?: number; fiber?: number };
  /** 0..1 — adherence to the module's own plan/target. */
  adherence?: number;
  /** 0..1 — consistency. */
  consistency?: number;
}

/**
 * Append-only unit of "something happened". `payload` is OPAQUE to the kernel and private
 * to the owning module; the kernel and every layer only ever touch `metrics`.
 */
export interface ActivityEvent<P = unknown> {
  /** Idempotency key (stable per logical event). */
  id: string;
  /** ISO timestamp. */
  at: string;
  module: ModuleId;
  /** "<module>.<noun>.<verb>", e.g. "pausa.set.done". */
  kind: string;
  personId: PersonId;
  /** Payload schema version (per kind). */
  v: number;
  payload: P;
  metrics?: ActivityMetrics;
}
