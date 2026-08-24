import { EQUIPMENT, EXERCISES, exerciseContext, isAvailable, variantLabel } from "@/domain/seed";
import { DEFAULT_INTENSITY, INTENSITIES, scaleSets } from "@/domain/intensity";
import { MUSCLE_LABEL } from "@/domain/types";
import type { Equipment, EquipmentId, Exercise, LogEntry, UserProfile } from "@/domain/types";
import type { Settings } from "@/lib/engine";
import { effectiveSettings } from "@/lib/engine";
// Type-only imports (erased at runtime) — the store's own shapes stay the single source
// of truth without pulling zustand/Tauri into this pure module.
import type { DayType, WeekKind } from "@/store/useStore";
import { analyzeRoutine } from "./analysis";

const DOW = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const REST = "rest";

/**
 * Flat slice of the store that {@link buildCoachContextFromSnapshot} reads. Provider-agnostic
 * and framework-free: the desktop builds it from `useStore.getState()`, while Convex can
 * recompute it from the user's config docs + the static seed.
 */
export interface CoachSnapshot {
  profile: UserProfile;
  settings: Settings;
  ownedEquipment: EquipmentId[];
  customEquipment: Equipment[];
  customExercises: Exercise[];
  dayTypes: DayType[];
  week: string[];
  dayKind: (WeekKind | null)[];
  logs: LogEntry[];
}

/**
 * Provider-agnostic snapshot of everything the coach needs to reason: profile,
 * settings, weekly plan, day-type routines (with feasibility + balance), the
 * exercise catalog it can pick from, owned equipment, and a progress summary
 * from the logs. Pure derivation of a store slice + seed; no zustand/Tauri/React.
 * Every provider (API/local) feeds this to the model; CC mode can dump it to disk.
 */
export function buildCoachContextFromSnapshot(s: CoachSnapshot) {
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
    const intensity = dt.intensity ?? DEFAULT_INTENSITY;
    // feasibility/balance must reflect the SCHEDULED sets (after intensity), not the raw ones
    const scheduled = dt.routine.map((r) => ({ ...r, sets: scaleSets(r.sets, intensity) }));
    const a = analyzeRoutine(scheduled, s.ownedEquipment, effectiveSettings(s.settings, dt), byId);
    return {
      id: dt.id,
      name: dt.name,
      intensity,
      // per-day scheduling override (own window/rest); undefined → uses the global settings
      window: dt.window,
      minRest: dt.minRest,
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
    intensities: INTENSITIES.map((m) => ({ id: m.id, name: m.name, factor: m.factor })),
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

export type CoachContext = ReturnType<typeof buildCoachContextFromSnapshot>;
