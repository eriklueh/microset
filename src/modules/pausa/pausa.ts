/**
 * Módulo PAUSA (= microset de hoy: micro-sets de calistenia moviéndote de la silla).
 * See docs/VISION.md §5.
 *
 * Fase 0 · additive only: this defines Pausa's manifest + its pure `contribute()` mapper
 * and a `LogEntry → ActivityEvent` adapter, matching the XP model already in levels.ts.
 * Nothing here is wired into the running store yet — importing this file only registers
 * the manifest (used by tests today, by the shell in Fase 0d). No behavior change.
 */
import { intrinsicSetMetrics } from "@/domain/setContribution";
import type { Exercise, LogEntry } from "@/domain/types";
import {
  registerModule,
  SELF,
  type ActivityEvent,
  type ActivityMetrics,
  type ContributeContext,
  type ModuleManifest,
} from "@/kernel";

export const PAUSA_SET_DONE = "pausa.set.done";

export interface PausaSetPayload {
  exerciseId: string;
  variantId?: string;
}

/**
 * Intrinsic (intensity=1) per-set contribution: roleWeight × variantDifficulty per body
 * group. Derived from the shared `intrinsicSetMetrics` primitive (single source with levels.ts).
 * Day-intensity and the per-group/day soft-cap stay in the gamification projection (they depend
 * on the plan, which can change after the set was logged).
 */
export function pausaContribute(
  payload: PausaSetPayload,
  exercise: (id: string) => Exercise | undefined,
): ActivityMetrics | undefined {
  const ex = exercise(payload.exerciseId);
  if (!ex) return undefined;
  return intrinsicSetMetrics(ex, payload.variantId);
}

/** Wrap an existing LogEntry into a pausa.set.done event (deterministic, idempotent id). */
export function logEntryToEvent(
  log: LogEntry,
  exercise: (id: string) => Exercise | undefined,
): ActivityEvent<PausaSetPayload> {
  const payload: PausaSetPayload = { exerciseId: log.exerciseId, variantId: log.variantId };
  return {
    id: `pausa:set:${log.at}:${log.exerciseId}:${log.variantId ?? ""}`,
    at: log.at,
    module: "pausa",
    kind: PAUSA_SET_DONE,
    personId: SELF,
    v: 1,
    payload,
    metrics: pausaContribute(payload, exercise),
  };
}

/**
 * Kernel-facing projection: map the app's append-only `logs:LogEntry[]` stream into the unified
 * ActivityEvent stream (each with its metrics envelope), so cross-cutting layers (gamification,
 * social, coach) can read the metrics WITHOUT knowing about LogEntry or Pausa internals.
 *
 * Additive only — nothing in the running app consumes this yet; it's the read-side seam future
 * layers plug into. Deterministic + idempotent (stable event ids via logEntryToEvent).
 */
export function activityFromLogs(
  logs: LogEntry[],
  byId: (id: string) => Exercise | undefined,
): ActivityEvent<PausaSetPayload>[] {
  return logs.map((l) => logEntryToEvent(l, byId));
}

export const pausaManifest: ModuleManifest = {
  id: "pausa",
  fileGroup: "logs",
  toolNamespace: "pausa",
  sync: "derived-only",
  shareable: true,
  scoredInLeague: true,
  defaultEnabled: true,
  contribute: (event: ActivityEvent, ctx: ContributeContext) =>
    pausaContribute(event.payload as PausaSetPayload, ctx.exercise),
};

registerModule(pausaManifest);
