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
// Theme-aware via CSS vars (defined per theme in index.css) — react-body-highlighter
// renders inline SVG, so `fill: var(--…)` resolves and recolors with light/dark.
const AMBER = ["var(--m-sec1)", "var(--m-sec2)", "var(--m-sec)"];
const LIME = ["var(--m-pri1)", "var(--m-pri2)", "var(--acc)"];
/** highlightedColors for react-body-highlighter: [amber×3, lime×3], index by freq-1. */
export const HEAT_RAMP = [...AMBER, ...LIME];
export const NONE_COLOR = "var(--m-none)";

/** Frequency (1-6) encoding role family + intensity level for a muscle. */
export function freqFor(role: Role, level: Level): number {
  const base = role === "primary" ? 3 : 0;
  return base + level; // primary → 4..6, secondary → 1..3
}

export const PRIMARY_COLOR = "var(--acc)";
export const SECONDARY_COLOR = "var(--m-sec)";

// ---- create-form helpers: presets, name suggestion, role↔state ---------------

/** Specific muscle roles per coarse pattern — seeds the create form per category. */
export const PATTERN_PRESETS: Record<MuscleGroup, Record<string, Role>> = {
  push: { chest: "primary", triceps: "primary", "front-deltoids": "secondary" },
  pull: { "upper-back": "primary", biceps: "primary", "back-deltoids": "secondary", forearm: "secondary" },
  legs: { quadriceps: "primary", gluteal: "primary", hamstring: "secondary", calves: "secondary", adductor: "secondary" },
  core: { abs: "primary", obliques: "secondary", "lower-back": "secondary" },
};

/** Pre-seed the create-form picker from a coarse pattern. */
export function presetRoles(pattern: MuscleGroup): Record<string, Role> {
  return { ...(PATTERN_PRESETS[pattern] ?? {}) };
}

/** Cycle a muscle's role: none → primary → secondary → none. */
export function cycleRole(role: Role | undefined): Role {
  return role === "primary" ? "secondary" : role === "secondary" ? "none" : "primary";
}

type Suggestion = { pattern: MuscleGroup; muscles: Record<string, Role> };

/** Keyword → (pattern + specific muscles) rules for name-based autofill. */
const SUGGEST_RULES: { kw: string[]; pattern: MuscleGroup; muscles: Record<string, Role> }[] = [
  { kw: ["glúteo", "gluteo", "puente", "hip thrust", "thrust"], pattern: "legs", muscles: { gluteal: "primary", hamstring: "primary", quadriceps: "secondary" } },
  { kw: ["pantorrilla", "gemelo", "calf", "elevación de tal"], pattern: "legs", muscles: { calves: "primary" } },
  { kw: ["sentadilla", "búlgara", "bulgara", "zancada", "split", "pistol", "sentadi", "cuádriceps", "cuadriceps", "squat", "lunge"], pattern: "legs", muscles: { quadriceps: "primary", gluteal: "primary", hamstring: "secondary" } },
  { kw: ["curl", "bíceps", "biceps"], pattern: "pull", muscles: { biceps: "primary", forearm: "secondary" } },
  { kw: ["dominada", "pull up", "pull-up", "pullup", "jalón", "jalon", "remo", "row", "australiana"], pattern: "pull", muscles: { "upper-back": "primary", biceps: "primary", "back-deltoids": "secondary", forearm: "secondary" } },
  { kw: ["tríceps", "triceps", "extensión", "extension", "press francés", "frances"], pattern: "push", muscles: { triceps: "primary" } },
  { kw: ["militar", "overhead", "hombro", "lateral", "pike"], pattern: "push", muscles: { "front-deltoids": "primary", triceps: "secondary" } },
  { kw: ["fondo", "dip", "flexión", "flexion", "push up", "push-up", "lagartija", "press", "banca", "diamante", "pecho"], pattern: "push", muscles: { chest: "primary", triceps: "primary", "front-deltoids": "secondary" } },
  { kw: ["plancha", "l-sit", "lsit", "abdomen", "abdominal", "crunch", "hollow", "core", "rueda", "ab wheel", "oblicuo"], pattern: "core", muscles: { abs: "primary", obliques: "secondary", "lower-back": "secondary" } },
];

/** Infer pattern + specific muscles from a free-text exercise name (null if no match). */
export function suggestFromName(raw: string): Suggestion | null {
  const n = (raw || "").toLowerCase().trim();
  if (!n) return null;
  for (const r of SUGGEST_RULES) {
    if (r.kw.some((k) => n.indexOf(k) >= 0)) return { pattern: r.pattern, muscles: { ...r.muscles } };
  }
  return null;
}

/** Body groups covered by a set of fine-muscle roles, with their role (primary wins). */
export function coveredGroupsFromRoles(roles: Record<string, Role>): Partial<Record<BodyGroup, Role>> {
  const out: Partial<Record<BodyGroup, Role>> = {};
  for (const [mu, role] of Object.entries(roles)) {
    if (role === "none") continue;
    const g = MUSCLE_GROUP[mu];
    if (!g) continue;
    if (role === "primary" || out[g] !== "primary") out[g] = out[g] === "primary" ? "primary" : role;
  }
  return out;
}

/** Turn a roles map into a paint state (uniform level, for the live create preview). */
export function rolesToState(roles: Record<string, Role>, level: Level = 3): MuscleState {
  const st: MuscleState = {};
  for (const [m, r] of Object.entries(roles)) if (r !== "none") st[m] = { role: r, level };
  return st;
}

/** Merge two paint states (primary wins on role, max on level) — for projected coverage. */
export function mergeStates(a: MuscleState, b: MuscleState): MuscleState {
  const out: MuscleState = { ...a };
  for (const [m, s] of Object.entries(b)) {
    const cur = out[m];
    out[m] = {
      role: cur?.role === "primary" || s.role === "primary" ? "primary" : s.role,
      level: Math.max(cur?.level ?? 0, s.level) as Level,
    };
  }
  return out;
}
