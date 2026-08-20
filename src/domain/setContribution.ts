/**
 * The per-series XP primitive — SINGLE source of truth for `roleWeight × variantDifficulty`.
 *
 * Both the Pausa module's `contribute()` (which stamps the kernel metrics envelope at
 * intensity=1) and the `levels.ts` gamification projection (which then applies day-intensity
 * + the sqrt soft-cap) derive from these exact primitives, so the two can never drift.
 *
 * IMPORTANT: this file only owns the intrinsic per-(role, variant) scalar. Day-intensity and
 * the per-group/day soft-cap stay in the levels projection (they depend on the plan, which can
 * change after a set was logged). Keep this pure — no React, no store, no kernel imports.
 */
import type { BodyGroup } from "./bodyGroups";
import { exerciseGroupRoles } from "./bodyGroups";
import type { Exercise } from "./types";

export type SetRole = "primary" | "secondary";

/** Role → XP weight (a primary is worth double a secondary). Mirrors the body-map weights. */
export const ROLE_WEIGHT: Record<SetRole, number> = { primary: 1, secondary: 0.5 };

/** Difficulty multiplier for a variant by its index on the exercise's axis (easiest→hardest). */
export function variantDifficulty(idx: number): number {
  return 1 + Math.max(0, idx) * 0.25;
}

/**
 * The per-series primitive: `roleWeight × variantDifficulty`. Callers apply this in their own
 * accumulation loop (Pausa sums it into the metrics envelope; levels multiplies it by the day
 * intensity), so the arithmetic ORDER is preserved on each side and the numbers stay identical.
 */
export function setRoleXp(role: SetRole, variantIdx: number): number {
  return ROLE_WEIGHT[role] * variantDifficulty(variantIdx);
}

/**
 * Intrinsic (intensity=1) per-set contribution for an exercise+variant: `effortXp` (total) and
 * `muscleXp` (per body group), built from `setRoleXp`. This is exactly what Pausa stamps on the
 * kernel metrics envelope; the day-intensity + soft-cap live in the levels projection.
 */
export function intrinsicSetMetrics(
  ex: Exercise,
  variantId: string | undefined,
): { effortXp: number; muscleXp: Partial<Record<BodyGroup, number>> } {
  const idx = ex.axis.findIndex((v) => v.id === variantId);
  const { primary, secondary } = exerciseGroupRoles(ex);
  const muscleXp: Partial<Record<BodyGroup, number>> = {};
  let effortXp = 0;
  const add = (g: BodyGroup, role: SetRole) => {
    const x = setRoleXp(role, idx);
    muscleXp[g] = (muscleXp[g] ?? 0) + x;
    effortXp += x;
  };
  primary.forEach((g) => add(g, "primary"));
  secondary.forEach((g) => add(g, "secondary"));
  return { effortXp, muscleXp };
}
