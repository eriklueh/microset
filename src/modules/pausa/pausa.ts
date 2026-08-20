/**
 * Módulo PAUSA (= microset de hoy: micro-sets de calistenia moviéndote de la silla).
 * See docs/VISION.md §5.
 *
 * Fase 0 · additive only: this defines Pausa's manifest + its pure `contribute()` mapper
 * and a `LogEntry → ActivityEvent` adapter, matching the XP model already in levels.ts.
 * Nothing here is wired into the running store yet — importing this file only registers
 * the manifest (used by tests today, by the shell in Fase 0d). No behavior change.
 */
import { exerciseGroupRoles, type BodyGroup } from "@/domain/bodyGroups";
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

/** Role → XP weight (primary worth double a secondary). Mirrors levels.ts + the body map. */
const ROLE_WEIGHT: Record<"primary" | "secondary", number> = { primary: 1, secondary: 0.5 };

/** Difficulty multiplier by variant index on the exercise axis (easiest→hardest). Mirrors levels.ts. */
function variantDifficulty(idx: number): number {
  return 1 + Math.max(0, idx) * 0.25;
}

/**
 * Intrinsic (intensity=1) per-set contribution: roleWeight × variantDifficulty per body
 * group. Day-intensity and the per-group/day soft-cap stay in the gamification projection
 * (they depend on the plan, which can change after the set was logged).
 */
export function pausaContribute(
  payload: PausaSetPayload,
  exercise: (id: string) => Exercise | undefined,
): ActivityMetrics | undefined {
  const ex = exercise(payload.exerciseId);
  if (!ex) return undefined;
  const diff = variantDifficulty(ex.axis.findIndex((v) => v.id === payload.variantId));
  const { primary, secondary } = exerciseGroupRoles(ex);
  const muscleXp: Partial<Record<BodyGroup, number>> = {};
  let effortXp = 0;
  const add = (g: BodyGroup, role: "primary" | "secondary") => {
    const x = ROLE_WEIGHT[role] * diff;
    muscleXp[g] = (muscleXp[g] ?? 0) + x;
    effortXp += x;
  };
  primary.forEach((g) => add(g, "primary"));
  secondary.forEach((g) => add(g, "secondary"));
  return { effortXp, muscleXp };
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
