import { createDayPlan } from "@/lib/engine";
import type { RoutineItem, Settings } from "@/lib/engine";
import { isAvailable } from "@/domain/seed";
import type { EquipmentId, Exercise, MuscleGroup } from "@/domain/types";

export interface RoutineAnalysis {
  /** Sets that the user can actually do (owns the equipment). */
  totalSets: number;
  /** How many of those fit in the work window. */
  fits: number;
  allFit: boolean;
  /** Set count per muscle group. */
  balance: Record<MuscleGroup, number>;
}

/**
 * Pure feasibility + muscle-balance analysis for a routine. Shared by the Rutina
 * view and the coach context so both judge "does it fit / is it balanced" the
 * same way. `now` is the work-window start so the result is time-of-day stable.
 */
export function analyzeRoutine(
  routine: RoutineItem[],
  owned: EquipmentId[],
  settings: Settings,
  byId: (id: string) => Exercise | undefined,
): RoutineAnalysis {
  const doable = routine.filter((r) => {
    const ex = byId(r.exerciseId);
    return ex ? isAvailable(ex, owned) : true;
  });
  const totalSets = doable.reduce((n, r) => n + r.sets, 0);
  const plan = createDayPlan(doable, settings, settings.workWindow.start);
  const fits = plan.blocks.filter((b) => b.time >= 0).length;

  const balance: Record<MuscleGroup, number> = { pull: 0, push: 0, core: 0, legs: 0 };
  for (const r of doable) {
    const ex = byId(r.exerciseId);
    if (ex) balance[ex.muscle] += r.sets;
  }

  return { totalSets, fits, allFit: fits >= totalSets, balance };
}
