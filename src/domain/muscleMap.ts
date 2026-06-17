/**
 * Bridges our coarse domain (one MuscleGroup per exercise) to the fine muscles
 * that react-body-highlighter renders, so the Rutina body map can paint coverage
 * by real volume. Seed exercises get a precise mapping; custom exercises fall
 * back to a sensible set for their group.
 */
import type { Muscle } from "react-body-highlighter";
import type { Exercise, MuscleGroup } from "./types";

export type BodyMuscle = Muscle;

/** Precise per-exercise muscle mapping for the seed catalog. */
export const EXERCISE_MUSCLES: Record<string, BodyMuscle[]> = {
  pullups: ["upper-back", "biceps", "forearm"],
  chinups: ["biceps", "upper-back", "forearm"],
  "hanging-leg-raises": ["abs", "obliques"],
  dips: ["chest", "triceps", "front-deltoids"],
  lsit: ["abs", "quadriceps"],
  "parallette-pushups": ["chest", "triceps", "front-deltoids"],
  "tuck-planche": ["front-deltoids", "chest", "abs"],
  "band-rows": ["upper-back", "biceps"],
  "band-pullaparts": ["back-deltoids", "trapezius", "upper-back"],
  "band-facepulls": ["back-deltoids", "trapezius"],
};

/** Fallback by group for custom exercises (which only carry a MuscleGroup). */
const GROUP_MUSCLES: Record<MuscleGroup, BodyMuscle[]> = {
  pull: ["upper-back", "biceps"],
  push: ["chest", "triceps"],
  core: ["abs"],
  legs: ["quadriceps", "gluteal"],
};

export function musclesForExercise(ex: Exercise): BodyMuscle[] {
  return EXERCISE_MUSCLES[ex.id] ?? GROUP_MUSCLES[ex.muscle] ?? [];
}

/** Coverage regions for the panel — each aggregates a set of fine muscles. */
export const REGIONS: { id: string; muscles: BodyMuscle[] }[] = [
  { id: "chest", muscles: ["chest"] },
  { id: "back", muscles: ["upper-back", "lower-back", "trapezius"] },
  { id: "shoulders", muscles: ["front-deltoids", "back-deltoids"] },
  { id: "arms", muscles: ["biceps", "triceps", "forearm"] },
  { id: "core", muscles: ["abs", "obliques"] },
  { id: "legs", muscles: ["quadriceps", "hamstring", "gluteal", "calves"] },
];

/** Load → intensity bucket: 0 none · 1 low (1-2) · 2 mid (3-5) · 3 high (6+). */
export function loadBucket(sets: number): 0 | 1 | 2 | 3 {
  if (sets <= 0) return 0;
  if (sets <= 2) return 1;
  if (sets <= 5) return 2;
  return 3;
}

/** Lime intensity ramp (index = bucket-1) for highlightedColors. */
export const HEAT_COLORS = ["#4a5f12", "#86a81c", "#c4f82a"];
