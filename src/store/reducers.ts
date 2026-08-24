/**
 * Pure config reducers — the read-modify-write bodies of the store's config
 * actions, lifted out of `useStore.ts` as framework-free functions.
 *
 * This module is intentionally PURE: no @tauri-apps, no React, no zustand, no
 * DOM — only types (imported `import type`, erased at runtime) + logic. That
 * lets the Convex backend (V8, no Node/Tauri) reuse the EXACT same transforms
 * the desktop store uses, so a config change lands identically whether it comes
 * from the UI or from a remote coach mutation. The effects that surround these
 * transforms (calling `set`, `get().replan()`, generating an id, reading the
 * clock) stay in the store / mutation caller — here we only compute the next
 * shape.
 *
 * Each reducer takes the relevant config slice + typed args and returns the
 * CHANGED keys (a patch), matching the store's `set((s) => ({ … }))` idiom
 * verbatim. The store spreads the patch via `set`; a Convex mutation spreads it
 * onto the current userDoc (`{ ...doc, ...reducer(doc, args) }`). Behavior is
 * identical to the pre-refactor store — logic was moved, not changed.
 */

import type { RoutineItem, Settings, TimeWindow } from "@/lib/engine";
import type { Equipment, EquipmentId, Exercise, UserProfile } from "@/domain/types";
import type { IntensityId } from "@/domain/intensity";
// Type-only imports of the config shapes defined in the store. Erased at compile
// time, so no runtime dependency on zustand/Tauri/DOM leaks in (and no cycle).
import type { CustomExerciseInput, DayOverride, DayType, WeekKind } from "./useStore";

// ── shared helpers (previously private in useStore) ─────────────────────────

/** Fresh id. Uses the Web Crypto global (available in browsers, Node 19+ and
 *  Convex's V8) — deterministic-friendly: create-reducers take the id as an
 *  argument so the caller (store or mutation) decides how it's minted. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Mon-first weekday (0=Mon … 6=Sun) for a stored `YYYY-M-D` date key. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(y, (m ?? 1) - 1, d ?? 1).getDay() + 6) % 7;
}

/** Replace one day-type's routine via `fn`, leaving the others untouched. */
export function updateRoutine(
  dayTypes: DayType[],
  id: string,
  fn: (routine: RoutineItem[]) => RoutineItem[],
): DayType[] {
  return dayTypes.map((d) => (d.id === id ? { ...d, routine: fn(d.routine) } : d));
}

// ── config slice shapes the reducers operate on ─────────────────────────────

/** equipment.json */
export interface EquipmentSlice {
  ownedEquipment: EquipmentId[];
  customEquipment: Equipment[];
}
/** exercises.json */
export interface ExercisesSlice {
  customExercises: Exercise[];
}
/** routine.json */
export interface RoutineSlice {
  dayTypes: DayType[];
  week: string[];
  dayKind: (WeekKind | null)[];
  dayOverrides: Record<string, DayOverride>;
}
/** settings.json (only the subfields the config actions touch) */
export interface SettingsSlice {
  settings: Settings;
}
/** profile.json */
export interface ProfileSlice {
  profile: UserProfile;
}

// ── equipment ───────────────────────────────────────────────────────────────

/** Build the Equipment entity a fresh custom item becomes (trimmed name). */
export function buildEquipment(id: string, name: string): Equipment {
  return { id, name: name.trim() };
}

/** Add a custom equipment item — you own what you add (auto-owned). */
export function addEquipment(s: EquipmentSlice, eq: Equipment): Partial<EquipmentSlice> {
  return {
    customEquipment: [...s.customEquipment, eq],
    ownedEquipment: [...s.ownedEquipment, eq.id],
  };
}

/** Toggle whether an equipment id is owned. */
export function toggleEquipment(s: EquipmentSlice, id: EquipmentId): Partial<EquipmentSlice> {
  return {
    ownedEquipment: s.ownedEquipment.includes(id)
      ? s.ownedEquipment.filter((e) => e !== id)
      : [...s.ownedEquipment, id],
  };
}

// ── exercises ────────────────────────────────────────────────────────────────

/** Shape a custom exercise from user input + a chosen id (bodyweight axis, default sets). */
export function buildExercise(id: string, input: CustomExerciseInput): Exercise {
  return {
    id,
    name: input.name,
    equipment: input.equipment,
    muscle: input.muscle,
    primary: input.primary,
    secondary: input.secondary,
    measure: input.measure,
    context: input.context,
    defaultSets: input.defaultSets ?? 3,
    defaultReps: input.defaultReps,
    axis: [{ id: "bw", label: "Peso corporal", kind: "bodyweight" }],
  };
}

/** Append a (pre-built) custom exercise. */
export function addExercise(s: ExercisesSlice, ex: Exercise): Partial<ExercisesSlice> {
  return { customExercises: [...s.customExercises, ex] };
}

// ── routine: per-day-type editing ────────────────────────────────────────────

/** Add an exercise to a day-type's routine (dedup by exerciseId). */
export function addToRoutine(
  s: RoutineSlice,
  dayTypeId: string,
  item: RoutineItem,
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
      r.some((x) => x.exerciseId === item.exerciseId) ? r : [...r, item],
    ),
  };
}

/** Set the daily set count for an exercise (floored at 1). */
export function setRoutineSets(
  s: RoutineSlice,
  dayTypeId: string,
  exerciseId: string,
  sets: number,
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
      r.map((x) => (x.exerciseId === exerciseId ? { ...x, sets: Math.max(1, sets) } : x)),
    ),
  };
}

/** Set reps/duration override for an exercise. */
export function setRoutineTarget(
  s: RoutineSlice,
  dayTypeId: string,
  exerciseId: string,
  target: string,
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
      r.map((x) => (x.exerciseId === exerciseId ? { ...x, target } : x)),
    ),
  };
}

/** Set the intensity variant for an exercise. */
export function setRoutineVariant(
  s: RoutineSlice,
  dayTypeId: string,
  exerciseId: string,
  variantId: string,
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
      r.map((x) => (x.exerciseId === exerciseId ? { ...x, variantId } : x)),
    ),
  };
}

/** Remove an exercise from a day-type's routine. */
export function removeFromRoutine(
  s: RoutineSlice,
  dayTypeId: string,
  exerciseId: string,
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
      r.filter((x) => x.exerciseId !== exerciseId),
    ),
  };
}

/** Move one exercise up (-1) or down (+1) in the day-type's routine. */
export function moveRoutineItem(
  s: RoutineSlice,
  dayTypeId: string,
  exerciseId: string,
  dir: -1 | 1,
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) => {
      const i = r.findIndex((x) => x.exerciseId === exerciseId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }),
  };
}

/** Set the full exercise order for a day-type; unlisted items keep their order at the end. */
export function setRoutineOrder(
  s: RoutineSlice,
  dayTypeId: string,
  orderedExerciseIds: string[],
): Partial<RoutineSlice> {
  return {
    dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) => {
      const rank = new Map(orderedExerciseIds.map((id, i) => [id, i]));
      const at = (x: RoutineItem) => rank.get(x.exerciseId) ?? Number.POSITIVE_INFINITY;
      return [...r]
        .map((x, i) => ({ x, i }))
        .sort((a, b) => at(a.x) - at(b.x) || a.i - b.i)
        .map((e) => e.x);
    }),
  };
}

/** Set a day-type's intensity (non-destructive volume scale). */
export function setIntensity(
  s: RoutineSlice,
  dayTypeId: string,
  id: IntensityId,
): Partial<RoutineSlice> {
  return {
    dayTypes: s.dayTypes.map((d) => (d.id === dayTypeId ? { ...d, intensity: id } : d)),
  };
}

/** Override a day-type's schedule (own window / min rest). Pass null on a field to clear it. */
export function setDaySchedule(
  s: RoutineSlice,
  dayTypeId: string,
  patch: { window?: TimeWindow | null; minRest?: number | null },
): Partial<RoutineSlice> {
  return {
    dayTypes: s.dayTypes.map((d) => {
      if (d.id !== dayTypeId) return d;
      const next = { ...d };
      if ("window" in patch) {
        if (patch.window) next.window = patch.window;
        else delete next.window;
      }
      if ("minRest" in patch) {
        if (patch.minRest != null) next.minRest = Math.max(1, Math.min(180, patch.minRest));
        else delete next.minRest;
      }
      return next;
    }),
  };
}

// ── routine: day-type management ─────────────────────────────────────────────

/** Add a new empty day-type under the given id. */
export function addDayType(s: RoutineSlice, id: string, name: string): Partial<RoutineSlice> {
  return { dayTypes: [...s.dayTypes, { id, name, routine: [] }] };
}

/** Add a full day-type (e.g. a copied/shared routine) under a fresh id. */
export function importDayType(
  s: RoutineSlice,
  id: string,
  dt: Omit<DayType, "id">,
): Partial<RoutineSlice> {
  return { dayTypes: [...s.dayTypes, { ...dt, id }] };
}

/** Rename a day-type. */
export function renameDayType(s: RoutineSlice, id: string, name: string): Partial<RoutineSlice> {
  return { dayTypes: s.dayTypes.map((d) => (d.id === id ? { ...d, name } : d)) };
}

/**
 * Delete a day-type. Guard: at least one must remain — if only one is left the
 * transform is a no-op (returns no changed keys). Week refs to the removed id
 * are rewritten to the first surviving day-type.
 */
export function removeDayType(s: RoutineSlice, id: string): Partial<RoutineSlice> {
  if (s.dayTypes.length <= 1) return {};
  const dayTypes = s.dayTypes.filter((d) => d.id !== id);
  const fallback = dayTypes[0].id;
  const week = s.week.map((slot) => (slot === id ? fallback : slot));
  return { dayTypes, week };
}

// ── routine: week / per-date overrides ───────────────────────────────────────

/** Assign a slot (day-type id or REST) to a weekday index (0=Mon … 6=Sun). */
export function setWeekDay(s: RoutineSlice, index: number, slot: string): Partial<RoutineSlice> {
  return { week: s.week.map((v, i) => (i === index ? slot : v)) };
}

/** Tag a weekday as home/office (or clear it). */
export function setDayKind(
  s: RoutineSlice,
  index: number,
  kind: WeekKind | null,
): Partial<RoutineSlice> {
  return { dayKind: s.dayKind.map((v, i) => (i === index ? kind : v)) };
}

/** Set/merge a per-date override — seeds from the weekly pattern for that date. */
export function setDayOverride(
  s: RoutineSlice,
  date: string,
  patch: Partial<DayOverride>,
): Partial<RoutineSlice> {
  const wd = weekdayOfKey(date);
  const base = s.dayOverrides[date] ?? { slot: s.week[wd], kind: s.dayKind[wd] };
  return { dayOverrides: { ...s.dayOverrides, [date]: { ...base, ...patch } } };
}

/** Drop a per-date override — that date reverts to the weekly pattern. */
export function clearDayOverride(s: RoutineSlice, date: string): Partial<RoutineSlice> {
  if (!(date in s.dayOverrides)) return {};
  const next = { ...s.dayOverrides };
  delete next[date];
  return { dayOverrides: next };
}

// ── settings / profile ───────────────────────────────────────────────────────

/** Merge a settings patch (the config action only ever passes workWindow/minRest). */
export function setSettings(s: SettingsSlice, patch: Partial<Settings>): Partial<SettingsSlice> {
  return { settings: { ...s.settings, ...patch } };
}

/** Merge a profile patch (goals/diet/constraints). */
export function setProfile(s: ProfileSlice, patch: Partial<UserProfile>): Partial<ProfileSlice> {
  return { profile: { ...s.profile, ...patch } };
}
