/**
 * Muscle targeting for the Rutina body map. Exercises carry SPECIFIC muscles
 * (`primary`/`secondary`, react-body-highlighter ids) set by the seed, the coach
 * or the create form. The body combines two signals: ROLE (primary lime /
 * secondary amber) and VOLUME (weighted sets → shade). When an exercise has no
 * explicit muscles, we fall back to a generic template from its coarse group.
 */
import { isAvailable } from "./seed";
import type { Exercise, MuscleGroup } from "./types";
import type { RoutineItem } from "@/lib/engine";
import type { EquipmentId } from "./types";

export type BodyGroup = "chest" | "back" | "shoulders" | "arms" | "core" | "legs";
export type Role = "primary" | "secondary" | "none";
export type Level = 1 | 2 | 3;

export const BODY_GROUPS: BodyGroup[] = ["chest", "back", "shoulders", "arms", "core", "legs"];

/** Fine muscles (react-body-highlighter) per group. */
export const GROUP_MUSCLES: Record<BodyGroup, string[]> = {
  chest: ["chest"],
  back: ["trapezius", "upper-back"],
  shoulders: ["front-deltoids", "back-deltoids"],
  arms: ["biceps", "triceps", "forearm"],
  core: ["abs", "obliques", "lower-back"],
  legs: ["quadriceps", "hamstring", "gluteal", "calves", "abductors", "adductor"],
};

/** Reverse: fine muscle id → its body group. */
export const MUSCLE_GROUP: Record<string, BodyGroup> = Object.fromEntries(
  BODY_GROUPS.flatMap((g) => GROUP_MUSCLES[g].map((m) => [m, g] as const)),
);

/** Generic primary/secondary groups by coarse group, for exercises with no explicit muscles. */
const GROUP_FALLBACK: Record<MuscleGroup, { prim: BodyGroup[]; sec: BodyGroup[] }> = {
  pull: { prim: ["back", "arms"], sec: ["shoulders"] },
  push: { prim: ["chest", "arms"], sec: ["shoulders"] },
  core: { prim: ["core"], sec: [] },
  legs: { prim: ["legs"], sec: ["core"] },
};

/** Default primary/secondary body groups for a coarse group (seeds the create form). */
export function defaultGroupsFor(muscle: MuscleGroup): { primary: BodyGroup[]; secondary: BodyGroup[] } {
  const fb = GROUP_FALLBACK[muscle] ?? { prim: [], sec: [] };
  return { primary: fb.prim, secondary: fb.sec };
}

/** The fine primary/secondary muscles for an exercise (explicit, else group fallback). */
export function exerciseFineRoles(ex: Exercise): { primary: string[]; secondary: string[] } {
  if ((ex.primary && ex.primary.length) || (ex.secondary && ex.secondary.length)) {
    return { primary: ex.primary ?? [], secondary: ex.secondary ?? [] };
  }
  const fb = GROUP_FALLBACK[ex.muscle] ?? { prim: [], sec: [] };
  return {
    primary: fb.prim.flatMap((g) => GROUP_MUSCLES[g]),
    secondary: fb.sec.flatMap((g) => GROUP_MUSCLES[g]),
  };
}

/** Body groups touched by an exercise (for the row chips), with their role. */
export function exerciseGroupRoles(ex: Exercise): { primary: BodyGroup[]; secondary: BodyGroup[] } {
  const { primary, secondary } = exerciseFineRoles(ex);
  const prim = new Set<BodyGroup>(primary.map((m) => MUSCLE_GROUP[m]).filter(Boolean));
  const sec = new Set<BodyGroup>();
  secondary.map((m) => MUSCLE_GROUP[m]).forEach((g) => {
    if (g && !prim.has(g)) sec.add(g);
  });
  return {
    primary: BODY_GROUPS.filter((g) => prim.has(g)),
    secondary: BODY_GROUPS.filter((g) => sec.has(g)),
  };
}

/** Per-muscle paint state: role + intensity level (1-3). */
export type MuscleState = Record<string, { role: Role; level: Level }>;

function bucket(load: number): Level {
  if (load <= 2) return 1;
  if (load <= 5) return 2;
  return 3;
}

/** One exercise isolated (hover): its muscles at full intensity. */
export function singleState(ex: Exercise): MuscleState {
  const { primary, secondary } = exerciseFineRoles(ex);
  const st: MuscleState = {};
  secondary.forEach((m) => (st[m] = { role: "secondary", level: 3 }));
  primary.forEach((m) => (st[m] = { role: "primary", level: 3 }));
  return st;
}

/** Whole-day aggregate: role (primary wins) + volume-weighted intensity per muscle. */
export function aggregateState(
  routine: RoutineItem[],
  byId: (id: string) => Exercise | undefined,
  owned: EquipmentId[],
): MuscleState {
  const load: Record<string, number> = {};
  const anyPrimary: Record<string, boolean> = {};
  for (const r of routine) {
    const ex = byId(r.exerciseId);
    if (!ex || !isAvailable(ex, owned)) continue;
    const { primary, secondary } = exerciseFineRoles(ex);
    primary.forEach((m) => {
      load[m] = (load[m] ?? 0) + r.sets;
      anyPrimary[m] = true;
    });
    secondary.forEach((m) => {
      load[m] = (load[m] ?? 0) + r.sets * 0.5;
    });
  }
  const st: MuscleState = {};
  for (const m of Object.keys(load)) {
    st[m] = { role: anyPrimary[m] ? "primary" : "secondary", level: bucket(load[m]) };
  }
  return st;
}

/** A group counts as worked if any of its muscles is trained (primary or secondary). */
export function groupWorked(state: MuscleState, group: BodyGroup): boolean {
  return GROUP_MUSCLES[group].some((m) => state[m]);
}

/** Distinct body groups touched (for the coverage score). */
export function workedGroupCount(state: MuscleState): number {
  return BODY_GROUPS.filter((g) => groupWorked(state, g)).length;
}

// ---- colors: role family (amber/lime) × volume shade -------------------------
const AMBER = ["#6b4a1c", "#b06a22", "#e8913c"];
const LIME = ["#5a6f18", "#9bbf22", "var(--acc)"];
/** highlightedColors for react-body-highlighter: [amber×3, lime×3], index by freq-1. */
export const HEAT_RAMP = [...AMBER, ...LIME];
export const NONE_COLOR = "#23231d";

/** Frequency (1-6) encoding role family + intensity level for a muscle. */
export function freqFor(role: Role, level: Level): number {
  const base = role === "primary" ? 3 : 0;
  return base + level; // primary → 4..6, secondary → 1..3
}

export const PRIMARY_COLOR = "var(--acc)";
export const SECONDARY_COLOR = "#e8913c";
