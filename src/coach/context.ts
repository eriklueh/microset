import { useStore } from "@/store/useStore";
import { buildCoachContextFromSnapshot, type CoachSnapshot } from "./context.core";

// Re-export so existing importers keep their public entry point (`../context`).
export type { CoachContext } from "./context.core";
export { buildCoachContextFromSnapshot, type CoachSnapshot } from "./context.core";

/**
 * Desktop entry point: reads the live zustand store and delegates to the pure core
 * {@link buildCoachContextFromSnapshot}. Same signature and return value as before —
 * callers (providers/local, providers/anthropic, store/files) are unaffected.
 */
export function buildCoachContext() {
  const s = useStore.getState();
  const snapshot: CoachSnapshot = {
    profile: s.profile,
    settings: s.settings,
    ownedEquipment: s.ownedEquipment,
    customEquipment: s.customEquipment,
    customExercises: s.customExercises,
    dayTypes: s.dayTypes,
    week: s.week,
    dayKind: s.dayKind,
    logs: s.logs,
  };
  return buildCoachContextFromSnapshot(snapshot);
}
