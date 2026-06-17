/**
 * Maps our exercises to the 6 body groups the Rutina "cockpit" colors, split
 * into primary / secondary roles. The body itself is rendered by
 * react-body-highlighter (its anatomy only) — we feed it each group's fine
 * muscles with frequency 2 (primary → lime) or 1 (secondary → amber).
 */
import type { Muscle } from "react-body-highlighter";
import type { Exercise, MuscleGroup } from "./types";

export type BodyGroup = "chest" | "back" | "shoulders" | "arms" | "core" | "legs";
export type Role = "primary" | "secondary" | "none";

export const BODY_GROUPS: BodyGroup[] = ["chest", "back", "shoulders", "arms", "core", "legs"];

/** Fine muscles (react-body-highlighter) that make up each group. */
export const GROUP_MUSCLES: Record<BodyGroup, Muscle[]> = {
  chest: ["chest"],
  back: ["trapezius", "upper-back"],
  shoulders: ["front-deltoids", "back-deltoids"],
  arms: ["biceps", "triceps", "forearm"],
  core: ["abs", "obliques", "lower-back"],
  legs: ["quadriceps", "hamstring", "gluteal", "calves", "abductors", "adductor"],
};

interface Roles {
  prim: BodyGroup[];
  sec: BodyGroup[];
}

/** Precise primary/secondary roles for the seed catalog. */
export const EXERCISE_ROLES: Record<string, Roles> = {
  pullups: { prim: ["back", "arms"], sec: ["shoulders", "core"] },
  chinups: { prim: ["arms", "back"], sec: ["core"] },
  "hanging-leg-raises": { prim: ["core"], sec: ["arms"] },
  dips: { prim: ["chest", "arms"], sec: ["shoulders", "core"] },
  lsit: { prim: ["core"], sec: ["arms"] },
  "parallette-pushups": { prim: ["chest", "arms"], sec: ["shoulders", "core"] },
  "tuck-planche": { prim: ["shoulders", "core"], sec: ["chest", "arms"] },
  "band-rows": { prim: ["back", "arms"], sec: ["shoulders"] },
  "band-pullaparts": { prim: ["shoulders", "back"], sec: [] },
  "band-facepulls": { prim: ["shoulders", "back"], sec: [] },
  // legs
  squats: { prim: ["legs"], sec: ["core"] },
  lunges: { prim: ["legs"], sec: ["core"] },
  "bulgarian-split-squat": { prim: ["legs"], sec: ["core"] },
  "glute-bridge": { prim: ["legs"], sec: ["core"] },
};

/** Fallback by group for custom exercises (which only carry a MuscleGroup). */
const GROUP_FALLBACK: Record<MuscleGroup, Roles> = {
  pull: { prim: ["back", "arms"], sec: ["shoulders"] },
  push: { prim: ["chest", "arms"], sec: ["shoulders"] },
  core: { prim: ["core"], sec: [] },
  legs: { prim: ["legs"], sec: ["core"] },
};

export function rolesForExercise(ex: Exercise): Roles {
  return EXERCISE_ROLES[ex.id] ?? GROUP_FALLBACK[ex.muscle] ?? { prim: [], sec: [] };
}

/** Role colors: primary follows the theme accent; secondary amber; none dark. */
export const PRIMARY_COLOR = "var(--acc)";
export const SECONDARY_COLOR = "#e8913c";
export const NONE_COLOR = "#23231d";
