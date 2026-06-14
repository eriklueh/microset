import { at } from "@/lib/engine";
import type { RoutineItem, Settings } from "@/lib/engine";
import type { Equipment, EquipmentId, Exercise, Variant } from "./types";

export const EQUIPMENT: Equipment[] = [
  { id: "pullup-bar", name: "Barra de dominadas" },
  { id: "dip-bars", name: "Barras de fondos" },
  { id: "parallettes", name: "Paraletas" },
  { id: "bands", name: "Bandas" },
];

// Reusable axes (ordered easiest → hardest).
const BAND_ASSIST_TO_LOAD: Variant[] = [
  { id: "b-wide", label: "Banda ancha", kind: "assist" },
  { id: "b-mid", label: "Banda media", kind: "assist" },
  { id: "b-thin", label: "Banda fina", kind: "assist" },
  { id: "bw", label: "Peso corporal", kind: "bodyweight" },
  { id: "load", label: "Con peso", kind: "load" },
];
// For band exercises the band IS the resistance: thicker = harder.
const BAND_RESISTANCE: Variant[] = [
  { id: "b-thin", label: "Banda fina", kind: "load" },
  { id: "b-mid", label: "Banda media", kind: "load" },
  { id: "b-wide", label: "Banda ancha", kind: "load" },
];

/** Catalog of exercises, each with its intensity axis. */
export const EXERCISES: Exercise[] = [
  {
    id: "pullups",
    name: "Dominadas",
    equipment: ["pullup-bar"],
    muscle: "pull",
    measure: "reps",
    defaultSets: 3,
    defaultReps: "5",
    axis: BAND_ASSIST_TO_LOAD,
  },
  {
    id: "chinups",
    name: "Dominadas supinas",
    equipment: ["pullup-bar"],
    muscle: "pull",
    measure: "reps",
    defaultSets: 3,
    defaultReps: "5",
    axis: BAND_ASSIST_TO_LOAD,
  },
  {
    id: "hanging-leg-raises",
    name: "Elevaciones de piernas colgado",
    equipment: ["pullup-bar"],
    muscle: "core",
    measure: "reps",
    defaultSets: 2,
    defaultReps: "8",
    axis: [
      { id: "knees", label: "Rodillas", kind: "assist" },
      { id: "knees-chest", label: "Rodillas al pecho", kind: "assist" },
      { id: "straight", label: "Piernas rectas", kind: "bodyweight" },
    ],
  },
  {
    id: "dips",
    name: "Fondos",
    equipment: ["dip-bars"],
    muscle: "push",
    measure: "reps",
    defaultSets: 3,
    defaultReps: "5",
    axis: BAND_ASSIST_TO_LOAD,
  },
  {
    id: "lsit",
    name: "L-sit",
    equipment: ["parallettes"],
    muscle: "core",
    measure: "hold",
    defaultSets: 2,
    defaultReps: "10-20s",
    axis: [
      { id: "tuck", label: "Tuck", kind: "assist" },
      { id: "one-leg", label: "Una pierna", kind: "assist" },
      { id: "full", label: "L-sit completo", kind: "bodyweight" },
    ],
  },
  {
    id: "parallette-pushups",
    name: "Flexiones en paraletas",
    equipment: ["parallettes"],
    muscle: "push",
    measure: "reps",
    defaultSets: 3,
    defaultReps: "10",
    axis: [
      { id: "incline", label: "Inclinado", kind: "assist" },
      { id: "flat", label: "Normal", kind: "bodyweight" },
      { id: "feet-up", label: "Pies elevados", kind: "bodyweight" },
      { id: "load", label: "Con peso", kind: "load" },
    ],
  },
  {
    id: "tuck-planche",
    name: "Tuck planche",
    equipment: ["parallettes"],
    muscle: "push",
    measure: "hold",
    defaultSets: 2,
    defaultReps: "10-15s",
    axis: [
      { id: "tuck", label: "Tuck", kind: "bodyweight" },
      { id: "adv-tuck", label: "Tuck avanzado", kind: "bodyweight" },
      { id: "straddle", label: "Straddle", kind: "load" },
    ],
  },
  {
    id: "band-rows",
    name: "Remo con banda",
    equipment: ["bands"],
    muscle: "pull",
    measure: "reps",
    defaultSets: 3,
    defaultReps: "12",
    axis: BAND_RESISTANCE,
  },
  {
    id: "band-pullaparts",
    name: "Pull-aparts con banda",
    equipment: ["bands"],
    muscle: "pull",
    measure: "reps",
    defaultSets: 2,
    defaultReps: "15",
    axis: BAND_RESISTANCE,
  },
  {
    id: "band-facepulls",
    name: "Face pulls con banda",
    equipment: ["bands"],
    muscle: "pull",
    measure: "reps",
    defaultSets: 2,
    defaultReps: "15",
    axis: BAND_RESISTANCE,
  },
];

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

/** An exercise is available when the user owns all its required equipment. */
export function isAvailable(exercise: Exercise, owned: EquipmentId[]): boolean {
  return exercise.equipment.every((eq) => owned.includes(eq));
}

/** Default rung: the bodyweight variant if present, else the first. */
export function defaultVariantId(exercise: Exercise): string {
  const v = exercise.axis.find((x) => x.kind === "bodyweight") ?? exercise.axis[0];
  return v?.id ?? "";
}

/** Resolve a variant's display label (falls back to the default rung). */
export function variantLabel(exerciseId: string, variantId?: string): string {
  const ex = exerciseById(exerciseId);
  if (!ex) return "";
  const v =
    ex.axis.find((x) => x.id === variantId) ??
    ex.axis.find((x) => x.kind === "bodyweight") ??
    ex.axis[0];
  return v?.label ?? "";
}

export const DEFAULT_OWNED: EquipmentId[] = [
  "pullup-bar",
  "dip-bars",
  "parallettes",
  "bands",
];

/** Erik's approved starting routine. */
export const DEFAULT_ROUTINE: RoutineItem[] = [
  { exerciseId: "pullups", name: "Dominadas", sets: 3, target: "5", variantId: "bw" },
  { exerciseId: "dips", name: "Fondos", sets: 3, target: "5", variantId: "bw" },
  { exerciseId: "lsit", name: "L-sit", sets: 2, target: "10-20s", variantId: "full" },
];

export const DEFAULT_SETTINGS: Settings = {
  workWindow: { start: at(9), end: at(18) },
  minRest: 45,
  avoidWindows: [{ start: at(13), end: at(14) }], // lunch
};
