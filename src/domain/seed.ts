import { at } from "@/lib/engine";
import type { RoutineItem, Settings } from "@/lib/engine";
import type { Equipment, EquipmentId, Exercise } from "./types";

export const EQUIPMENT: Equipment[] = [
  { id: "pullup-bar", name: "Barra de dominadas" },
  { id: "dip-bars", name: "Barras de fondos" },
  { id: "parallettes", name: "Paraletas" },
  { id: "bands", name: "Bandas" },
];

/** Catalog of exercises, mapped to the equipment they require. */
export const EXERCISES: Exercise[] = [
  { id: "pullups", name: "Dominadas", equipment: ["pullup-bar"], muscle: "pull", defaultSets: 3, defaultReps: "5" },
  { id: "chinups", name: "Dominadas supinas", equipment: ["pullup-bar"], muscle: "pull", defaultSets: 3, defaultReps: "5" },
  { id: "hanging-leg-raises", name: "Elevaciones de piernas colgado", equipment: ["pullup-bar"], muscle: "core", defaultSets: 2, defaultReps: "8" },
  { id: "dips", name: "Fondos", equipment: ["dip-bars"], muscle: "push", defaultSets: 3, defaultReps: "5" },
  { id: "lsit", name: "L-sit", equipment: ["parallettes"], muscle: "core", defaultSets: 2, defaultReps: "10–20s", isHold: true },
  { id: "parallette-pushups", name: "Flexiones en paraletas", equipment: ["parallettes"], muscle: "push", defaultSets: 3, defaultReps: "10" },
  { id: "tuck-planche", name: "Tuck planche", equipment: ["parallettes"], muscle: "push", defaultSets: 2, defaultReps: "10–15s", isHold: true },
  { id: "band-rows", name: "Remo con banda", equipment: ["bands"], muscle: "pull", defaultSets: 3, defaultReps: "12" },
  { id: "band-pullaparts", name: "Pull-aparts con banda", equipment: ["bands"], muscle: "pull", defaultSets: 2, defaultReps: "15" },
  { id: "band-facepulls", name: "Face pulls con banda", equipment: ["bands"], muscle: "pull", defaultSets: 2, defaultReps: "15" },
];

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

/** An exercise is available when the user owns all its required equipment. */
export function isAvailable(exercise: Exercise, owned: EquipmentId[]): boolean {
  return exercise.equipment.every((eq) => owned.includes(eq));
}

export const DEFAULT_OWNED: EquipmentId[] = [
  "pullup-bar",
  "dip-bars",
  "parallettes",
  "bands",
];

/** Erik's approved starting routine: pull-ups ×3, dips ×3, L-sit ×2. */
export const DEFAULT_ROUTINE: RoutineItem[] = [
  { exerciseId: "pullups", name: "Dominadas", sets: 3 },
  { exerciseId: "dips", name: "Fondos", sets: 3 },
  { exerciseId: "lsit", name: "L-sit", sets: 2 },
];

export const DEFAULT_SETTINGS: Settings = {
  workWindow: { start: at(9), end: at(18) },
  minRest: 45,
  avoidWindows: [{ start: at(13), end: at(14) }], // lunch
};
