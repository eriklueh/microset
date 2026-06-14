import { EQUIPMENT, EXERCISES, exerciseContext, isAvailable, variantLabel } from "@/domain/seed";
import { METHODOLOGIES, methodologyById } from "@/domain/methodologies";
import { MUSCLE_LABEL } from "@/domain/types";
import type { Exercise } from "@/domain/types";
import { useStore } from "@/store/useStore";
import { analyzeRoutine } from "./analysis";

const DOW = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const REST = "rest";

/**
 * Provider-agnostic snapshot of everything the coach needs to reason: profile,
 * settings, weekly plan, day-type routines (with feasibility + balance), the
 * exercise catalog it can pick from, owned equipment, and a progress summary
 * from the logs. Pure read of the store + seed; safe to call anytime. Every
 * provider (API/local) feeds this to the model; CC mode can dump it to disk.
 */
export function buildCoachContext() {
  const s = useStore.getState();
  const all: Exercise[] = [...EXERCISES, ...s.customExercises];
  const byId = (id: string) => all.find((e) => e.id === id);

  const catalog = all.map((e) => ({
    id: e.id,
    name: e.name,
    muscle: e.muscle,
    measure: e.measure,
    context: exerciseContext(e),
    equipment: e.equipment,
    available: isAvailable(e, s.ownedEquipment),
    defaultReps: e.defaultReps,
    variants: e.axis.map((v) => ({ id: v.id, label: v.label, kind: v.kind })),
  }));

  const counts: Record<string, { sets: number; lastVariant?: string; lastAt?: string }> = {};
  for (const l of s.logs) {
    const c = (counts[l.exerciseId] ??= { sets: 0 });
    c.sets++;
    c.lastVariant = l.variantId;
    c.lastAt = l.at;
  }
  const progress = Object.entries(counts).map(([id, c]) => ({
    exerciseId: id,
    name: byId(id)?.name ?? id,
    sets: c.sets,
    currentLevel: c.lastVariant ? variantLabel(id, c.lastVariant) : undefined,
    lastAt: c.lastAt,
  }));

  const dayTypes = s.dayTypes.map((dt) => {
    const a = analyzeRoutine(dt.routine, s.ownedEquipment, s.settings, byId);
    return {
      id: dt.id,
      name: dt.name,
      routine: dt.routine.map((r) => {
        const ex = byId(r.exerciseId);
        return {
          exerciseId: r.exerciseId,
          name: r.name,
          sets: r.sets,
          target: r.target ?? ex?.defaultReps,
          variant: variantLabel(r.exerciseId, r.variantId),
          muscle: ex?.muscle,
          context: ex ? exerciseContext(ex) : undefined,
        };
      }),
      totalSets: a.totalSets,
      fitsInDay: a.allFit ? "all" : `${a.fits}/${a.totalSets}`,
      balance: a.balance,
    };
  });

  const week = s.week.map((slot, i) => ({
    day: DOW[i],
    dayType: slot === REST ? "DESCANSO" : (s.dayTypes.find((d) => d.id === slot)?.name ?? slot),
    dayTypeId: slot,
    place: s.dayKind[i] ?? undefined, // "home" | "office" | undefined
  }));

  return {
    profile: s.profile,
    settings: {
      workWindow: s.settings.workWindow,
      minRest: s.settings.minRest,
      avoidWindows: s.settings.avoidWindows,
    },
    methodology: methodologyById(s.methodologyId)?.name ?? s.methodologyId,
    methodologies: METHODOLOGIES.map((m) => ({ id: m.id, name: m.name, sets: m.sets, minRest: m.minRest })),
    equipment: {
      owned: s.ownedEquipment,
      all: [...EQUIPMENT, ...s.customEquipment],
    },
    week,
    dayTypes,
    catalog,
    progress,
    muscleLabels: MUSCLE_LABEL,
  };
}

export type CoachContext = ReturnType<typeof buildCoachContext>;
