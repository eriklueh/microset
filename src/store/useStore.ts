import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createDayPlan,
  decline as engineDecline,
  effectiveSettings,
  markDone,
  skip as engineSkip,
  snooze as engineSnooze,
  withAvoidWindows,
} from "@/lib/engine";
import type { Block, Minute, RoutineItem, Settings, TimeWindow } from "@/lib/engine";
import type {
  Equipment,
  EquipmentId,
  Exercise,
  ExerciseContext,
  LogEntry,
  Measure,
  MuscleGroup,
  UserProfile,
} from "@/domain/types";
import {
  DEFAULT_OWNED,
  DEFAULT_ROUTINE,
  DEFAULT_SETTINGS,
  ROUTINE_DELOAD,
  ROUTINE_FULL_A,
  ROUTINE_FULL_B,
  exerciseById,
  isAvailable,
} from "@/domain/seed";
import { scaleSets, type IntensityId } from "@/domain/intensity";
import { applyTheme, type Accent, type ThemeConfig, type ThemeMode } from "@/lib/theme";
import { detectLang, type Lang } from "@/lib/strings";
import { setPanelVisible } from "@/lib/windows";
// Side-effect import: registers the Pausa manifest into the kernel module registry on
// boot. Nothing reads the registry yet (Fase 0), so behavior is unchanged.
import "@/modules/pausa/pausa";
// Side-effect import: registers the Entreno manifest (net-new module, default OFF). With the
// module disabled (the default) nothing reads it, so the app behaves exactly as today.
import "@/modules/entreno/entreno";
import type { Modality, Session, SessionLocation, SkipReason } from "@/modules/entreno/entreno";
// Pure config reducers (framework-free): the read-modify-write bodies of the config
// actions live here so Convex (Fase C) can reuse the exact same transforms. The store
// keeps the surrounding effects (set + get().replan(), id minting, clock reads).
import { newId, weekdayOfKey } from "./reducers";
import * as reducers from "./reducers";

/** A named routine template that can be assigned to weekdays. */
export interface DayType {
  id: string;
  name: string;
  routine: RoutineItem[];
  /** Volume knob for this day-type (scales scheduled sets; non-destructive). */
  intensity?: IntensityId;
  /** Per-day scheduling override — its own work window (e.g. an evening session). Falls back to global. */
  window?: TimeWindow;
  /** Per-day min rest between sets; falls back to global. Low values cluster sets together. */
  minRest?: number;
}

export type WeekKind = "home" | "office";
/** Sentinel week slot for a rest day. */
export const REST = "rest";

export interface CustomExerciseInput {
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentId[];
  measure: Measure;
  context: ExerciseContext;
  defaultReps: string;
  defaultSets?: number;
  /** Specific muscles worked (react-body-highlighter ids), for the body map. */
  primary?: string[];
  secondary?: string[];
}

export type CoachProviderId = "anthropic" | "local";
export interface CoachConfig {
  provider: CoachProviderId;
  model: string;
  endpoint: string; // for local (OpenAI-compatible) providers
}

/** Per-module enablement (kernel). Fresh installs enable Pausa (microset's only module today).
 *  Fresh factory each call so no default object is shared across store resets/migrations. */
const defaultModules = (): Record<string, { enabled: boolean }> => ({ pausa: { enabled: true } });

// ── Entreno module state (persisted; dormant until the module is enabled) ────────
/** A logged outcome of a training session on a given day. */
export interface EntrenoRecord {
  id: string;
  sessionId: string;
  date: string; // `YYYY-M-D`
  at: string; // ISO
  status: "done" | "skipped";
  /** Present when skipped — the motive that drives the adaptive planner. */
  reason?: SkipReason;
}

/** Owned slice for the Entreno module: its sessions, weekly program, and outcome log. */
export interface EntrenoState {
  sessions: Session[];
  /** length 7, Mon-first: a sessionId or null (rest / unassigned). */
  week: (string | null)[];
  records: EntrenoRecord[];
}

/** Fresh, empty Entreno state — the default in blank installs and old (pre-v7) blobs. */
const defaultEntreno = (): EntrenoState => ({ sessions: [], week: Array(7).fill(null), records: [] });

/** Input for creating a session (the store assigns the id + shapes the union). */
export interface NewSessionInput {
  modality: Modality;
  location: SessionLocation;
  external: boolean;
  name?: string;
  /** Bounding window (minutes-of-day). For external, prefer `startMin` + duration. */
  window?: { start: number; end: number };
  /** Start time (minutes-of-day). For external, sets window = { start, end: start + durationMin }. */
  startMin?: number;
  durationMin?: number;
  intensity?: number;
}

/** Patch for editing a session (only fields relevant to its kind are applied). */
export interface SessionPatch {
  modality?: Modality;
  location?: SessionLocation;
  name?: string;
  /** Bounding window (minutes-of-day). Pass null to clear it. */
  window?: { start: number; end: number } | null;
  /** Start time (minutes-of-day). Recomputes the window end from the current/patched duration. */
  startMin?: number;
  durationMin?: number;
  intensity?: number;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const DEFAULT_THEME: ThemeConfig = { mode: "dark", accent: "lime" };
const DEFAULT_PROFILE: UserProfile = { goals: "", diet: "", constraints: "" };
const DEFAULT_COACH: CoachConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  endpoint: "http://localhost:11434/v1",
};
const DEFAULT_DAYTYPE_ID = "default"; // legacy id used only by the pre-day-types migration
// Built-in day-types a fresh install can pick from: a full-body A/B split + a deload day.
const DEFAULT_DAYTYPES: DayType[] = [
  { id: "full-a", name: "Cuerpo completo A", intensity: "normal", routine: ROUTINE_FULL_A },
  { id: "full-b", name: "Cuerpo completo B", intensity: "normal", routine: ROUTINE_FULL_B },
  { id: "deload", name: "Descarga", intensity: "deload", routine: ROUTINE_DELOAD },
];
// Mon–Fri = A / B / A / B / deload, weekend rest.
const DEFAULT_WEEK: string[] = ["full-a", "full-b", "full-a", "full-b", "deload", REST, REST];
const DEFAULT_DAYKIND: (WeekKind | null)[] = Array(7).fill(null);

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Canonical date key `YYYY-M-D` (matches todayKey) from numeric parts. */
export function dateKey(y: number, month0: number, day: number): string {
  return `${y}-${month0 + 1}-${day}`;
}

/** A per-date plan override on top of the recurring weekly pattern. */
export interface DayOverride {
  slot: string; // dayTypeId or REST
  kind: WeekKind | null;
}

/** Day-type slot in effect for a date: the per-date override, else the weekly pattern. */
export function effectiveSlot(
  week: string[],
  overrides: Record<string, DayOverride>,
  key: string,
): string {
  return overrides[key]?.slot ?? week[weekdayOfKey(key)];
}

/** Place (home/office/none) in effect for a date: override, else the weekly pattern. */
export function effectiveKind(
  dayKind: (WeekKind | null)[],
  overrides: Record<string, DayOverride>,
  key: string,
): WeekKind | null {
  const o = overrides[key];
  return o ? o.kind : dayKind[weekdayOfKey(key)];
}

/** Current wall-clock time as minutes since midnight (the engine stays pure). */
export function nowMinutes(): Minute {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function dayTypeById(dayTypes: DayType[], id: string): DayType | undefined {
  return dayTypes.find((d) => d.id === id);
}

interface DayPlan {
  date: string;
  blocks: Block[];
  rest: boolean;
  dayTypeName: string | null;
}

interface State {
  ownedEquipment: EquipmentId[];
  dayTypes: DayType[];
  week: string[]; // length 7, Mon-first: dayTypeId or REST
  dayKind: (WeekKind | null)[]; // length 7, Mon-first
  dayOverrides: Record<string, DayOverride>; // per-date exceptions over the weekly pattern
  customExercises: Exercise[];
  customEquipment: Equipment[];
  settings: Settings;
  day: DayPlan | null;
  theme: ThemeConfig;
  lang: Lang;
  logs: LogEntry[];
  toastBlockId: string | null; // block currently shown in the toast window
  profile: UserProfile; // goals/diet/constraints for the AI coach
  coach: CoachConfig; // provider/model/endpoint for the AI coach
  /** Per-module enablement (kernel registry). Read by the shell to mount enabled modules. */
  modules: Record<string, { enabled: boolean }>;
  /** Entreno module's owned state (sessions/program/log). Dormant while the module is off. */
  entreno: EntrenoState;

  // preferences
  panelEnabled: boolean;
  notificationsEnabled: boolean;
  snoozeMinutes: number;
  demoMode: boolean;
  /** Foco/DND: epoch ms until which reminders are silenced (null = off). */
  focusUntil: number | null;
  /** Niveles — optional RPG gamification layer in Progreso (streak + attributes + achievements). */
  levelsEnabled: boolean;
  /** When on, a single missed non-rest day doesn't break the streak. */
  streakFreeze: boolean;
  /** Opt-in cross-device sync of CONFIG via Convex (Fase B1). Per-device, DEFAULT false.
   *  With it off the shipped app is identical to today — no cloud engine mounts. */
  syncEnabled: boolean;

  // routine editing (per day-type)
  addToRoutine: (dayTypeId: string, item: RoutineItem) => void;
  setRoutineSets: (dayTypeId: string, exerciseId: string, sets: number) => void;
  setRoutineTarget: (dayTypeId: string, exerciseId: string, target: string) => void;
  setRoutineVariant: (dayTypeId: string, exerciseId: string, variantId: string) => void;
  removeFromRoutine: (dayTypeId: string, exerciseId: string) => void;
  /** Move one exercise up (-1) or down (+1) in the day-type's routine — the basic daily order. */
  moveRoutineItem: (dayTypeId: string, exerciseId: string, dir: -1 | 1) => void;
  /** Set the full exercise order for a day-type (coach). Unlisted items keep their relative order at the end. */
  setRoutineOrder: (dayTypeId: string, orderedExerciseIds: string[]) => void;
  /** Set a day-type's intensity (non-destructive volume scale). */
  setIntensity: (dayTypeId: string, id: IntensityId) => void;
  /** Override a day-type's schedule (own window / rest). Pass null on a field to clear it (→ global). */
  setDaySchedule: (dayTypeId: string, patch: { window?: TimeWindow | null; minRest?: number | null }) => void;

  // day-type management
  addDayType: (name: string) => string;
  /** Add a full day-type (e.g. copied from a shared routine) under a fresh id. Returns the new id. */
  importDayType: (dt: Omit<DayType, "id">) => string;
  renameDayType: (id: string, name: string) => void;
  removeDayType: (id: string) => void;

  // custom exercises
  addCustomExercise: (input: CustomExerciseInput) => Exercise;
  removeCustomExercise: (id: string) => void;

  // custom equipment
  addCustomEquipment: (name: string) => Equipment;
  removeCustomEquipment: (id: string) => void;

  // coach profile + provider config
  setProfile: (patch: Partial<UserProfile>) => void;
  setCoachConfig: (patch: Partial<CoachConfig>) => void;

  // modules (kernel enablement)
  setModuleEnabled: (id: string, enabled: boolean) => void;

  // entreno module (create / edit / program / log / skip-with-reason a session)
  addEntrenoSession: (input: NewSessionInput) => string;
  updateEntrenoSession: (id: string, patch: SessionPatch) => void;
  removeEntrenoSession: (id: string) => void;
  addEntrenoItem: (sessionId: string, item: RoutineItem) => void;
  removeEntrenoItem: (sessionId: string, exerciseId: string) => void;
  setEntrenoWeekDay: (index: number, sessionId: string | null) => void;
  logEntrenoSession: (sessionId: string) => void;
  skipEntrenoSession: (sessionId: string, reason: SkipReason) => void;

  // week
  setWeekDay: (index: number, slot: string) => void;
  setDayKind: (index: number, kind: WeekKind | null) => void;
  /** Set/merge a per-date override (date key = `YYYY-M-D`). Seeds from the weekly pattern. */
  setDayOverride: (date: string, patch: Partial<DayOverride>) => void;
  /** Drop a per-date override — that date reverts to the weekly pattern. */
  clearDayOverride: (date: string) => void;

  // equipment / settings
  toggleEquipment: (id: EquipmentId) => void;
  setSettings: (patch: Partial<Settings>) => void;

  // theme
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;

  // language
  setLang: (lang: Lang) => void;

  // preferences setters
  setPanelEnabled: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setSnoozeMinutes: (minutes: number) => void;
  setDemoMode: (value: boolean) => void;
  setLevelsEnabled: (value: boolean) => void;
  setStreakFreeze: (value: boolean) => void;
  setSyncEnabled: (value: boolean) => void;

  // focus / DND (silences reminders for a window)
  setFocus: (minutes: number) => void;
  clearFocus: () => void;

  // quick log (free set, outside the day plan)
  logFreeSet: (exerciseId: string, variantId?: string) => void;

  // data
  resetSettings: () => void;
  resetAll: () => void;

  // today / engine
  ensureToday: () => void;
  replan: () => void;
  done: (blockId: string) => void;
  decline: (blockId: string) => void;
  snooze: (blockId: string, minutes: number) => void;
  skip: (blockId: string) => void;

  // toast reminder window
  showToast: (blockId: string) => void;
  dismissToast: () => void;
}

function demoBlocks(routine: RoutineItem[], owned: EquipmentId[], now: Minute): Block[] {
  const doable = routine.filter((r) => {
    const ex = exerciseById(r.exerciseId);
    return ex ? isAvailable(ex, owned) : true;
  });
  return doable.flatMap((r) =>
    Array.from({ length: r.sets }, (_, s) => ({
      id: `${r.exerciseId}#${s + 1}`,
      exerciseId: r.exerciseId,
      name: r.name,
      sets: 1,
      target: r.target,
      variantId: r.variantId,
      time: now,
      status: "pending" as const,
    })),
  );
}

/**
 * Persist migration (zustand). Additive-only: each step defaults a newly-introduced field
 * on older blobs without touching any existing data. Exported so it can be unit-tested
 * directly (the persist `.persist` API isn't attached in a storage-less test env).
 */
export function migratePersisted(persisted: unknown, version: number): unknown {
  const p = persisted as Record<string, unknown>;
  delete p.methodologyId; // v3: methodology → per-day-type intensity (default normal)
  // v4: optional gamification (Niveles). Default ON; freeze OFF. Older stores lack these.
  if (typeof p.levelsEnabled !== "boolean") p.levelsEnabled = true;
  if (typeof p.streakFreeze !== "boolean") p.streakFreeze = false;
  // v5: Foco/DND window. Older stores lack it; start cleared.
  if (typeof p.focusUntil !== "number") p.focusUntil = null;
  // v8: opt-in cross-device sync (Fase B1). Older stores lack it; DEFAULT OFF so an upgraded
  // install behaves exactly as before until the user turns sync on in Ajustes.
  if (typeof p.syncEnabled !== "boolean") p.syncEnabled = false;
  // v6: kernel module registry. Older stores (v5 and below) lack it; default to Pausa
  // enabled without touching any other field (routine/logs/settings stay intact).
  if (!p.modules || typeof p.modules !== "object") p.modules = defaultModules();
  // v7: Entreno module state. Older stores (v6 and below) lack it; default to EMPTY
  // without touching any other field (routine/logs/settings/modules stay intact).
  if (!p.entreno || typeof p.entreno !== "object" || Array.isArray(p.entreno)) p.entreno = defaultEntreno();
  if (p && (version < 1 || !p.dayTypes)) {
    const routine = (p.routine as RoutineItem[]) ?? DEFAULT_ROUTINE;
    p.dayTypes = [{ id: DEFAULT_DAYTYPE_ID, name: "Estándar", routine }];
    p.week = Array(7).fill(DEFAULT_DAYTYPE_ID);
    p.dayKind = Array(7).fill(null);
    delete p.routine;
  }
  if (p && (!p.dayOverrides || typeof p.dayOverrides !== "object")) p.dayOverrides = {};
  return p;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ownedEquipment: DEFAULT_OWNED,
      dayTypes: DEFAULT_DAYTYPES,
      week: DEFAULT_WEEK,
      dayKind: DEFAULT_DAYKIND,
      dayOverrides: {},
      customExercises: [],
      customEquipment: [],
      settings: DEFAULT_SETTINGS,
      day: null,
      theme: DEFAULT_THEME,
      lang: detectLang(),
      logs: [],
      toastBlockId: null,
      profile: DEFAULT_PROFILE,
      coach: DEFAULT_COACH,
      modules: defaultModules(),
      entreno: defaultEntreno(),
      panelEnabled: true,
      notificationsEnabled: true,
      snoozeMinutes: 30,
      demoMode: false,
      focusUntil: null,
      levelsEnabled: true,
      streakFreeze: false,
      syncEnabled: false,

      addToRoutine: (dayTypeId, item) => {
        set((s) => reducers.addToRoutine(s, dayTypeId, item));
        get().replan();
      },

      setRoutineSets: (dayTypeId, exerciseId, sets) => {
        set((s) => reducers.setRoutineSets(s, dayTypeId, exerciseId, sets));
        get().replan();
      },

      setRoutineTarget: (dayTypeId, exerciseId, target) => {
        set((s) => reducers.setRoutineTarget(s, dayTypeId, exerciseId, target));
      },

      setRoutineVariant: (dayTypeId, exerciseId, variantId) => {
        set((s) => reducers.setRoutineVariant(s, dayTypeId, exerciseId, variantId));
        get().replan();
      },

      removeFromRoutine: (dayTypeId, exerciseId) => {
        set((s) => reducers.removeFromRoutine(s, dayTypeId, exerciseId));
        get().replan();
      },

      moveRoutineItem: (dayTypeId, exerciseId, dir) => {
        set((s) => reducers.moveRoutineItem(s, dayTypeId, exerciseId, dir));
        get().replan();
      },

      setRoutineOrder: (dayTypeId, orderedExerciseIds) => {
        set((s) => reducers.setRoutineOrder(s, dayTypeId, orderedExerciseIds));
        get().replan();
      },

      setIntensity: (dayTypeId, id) => {
        set((s) => reducers.setIntensity(s, dayTypeId, id));
        get().replan();
      },

      setDaySchedule: (dayTypeId, patch) => {
        set((s) => reducers.setDaySchedule(s, dayTypeId, patch));
        get().replan();
      },

      addDayType: (name) => {
        const id = newId();
        set((s) => reducers.addDayType(s, id, name));
        return id;
      },

      importDayType: (dt) => {
        const id = newId();
        set((s) => reducers.importDayType(s, id, dt));
        return id;
      },

      renameDayType: (id, name) => set((s) => reducers.renameDayType(s, id, name)),

      removeDayType: (id) => {
        set((s) => reducers.removeDayType(s, id));
        get().replan();
      },

      addCustomExercise: (input) => {
        const ex = reducers.buildExercise(newId(), input);
        set((s) => reducers.addExercise(s, ex));
        return ex;
      },

      removeCustomExercise: (id) => {
        set((s) => ({
          customExercises: s.customExercises.filter((e) => e.id !== id),
          dayTypes: s.dayTypes.map((d) => ({
            ...d,
            routine: d.routine.filter((r) => r.exerciseId !== id),
          })),
        }));
        get().replan();
      },

      addCustomEquipment: (name) => {
        const eq = reducers.buildEquipment(newId(), name); // you own what you add
        set((s) => reducers.addEquipment(s, eq));
        return eq;
      },

      removeCustomEquipment: (id) => {
        set((s) => ({
          customEquipment: s.customEquipment.filter((e) => e.id !== id),
          ownedEquipment: s.ownedEquipment.filter((e) => e !== id),
          customExercises: s.customExercises.map((ex) => ({
            ...ex,
            equipment: ex.equipment.filter((eq) => eq !== id),
          })),
        }));
        get().replan();
      },

      setProfile: (patch) => set((s) => reducers.setProfile(s, patch)),
      setCoachConfig: (patch) => set((s) => ({ coach: { ...s.coach, ...patch } })),

      setModuleEnabled: (id, enabled) =>
        set((s) => ({ modules: { ...s.modules, [id]: { ...s.modules[id], enabled } } })),

      addEntrenoSession: (input) => {
        const id = newId();
        const durationMin = Math.max(0, input.durationMin ?? 45);
        // Window: an explicit one wins; else derive from a start time (+ duration for external).
        const window =
          input.window ??
          (input.startMin != null
            ? { start: input.startMin, end: input.startMin + (input.external ? durationMin : 0) }
            : undefined);
        const base = {
          id,
          modality: input.modality,
          location: input.location,
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
          ...(window ? { window } : {}),
        };
        const session: Session = input.external
          ? { ...base, external: true, durationMin, intensity: clamp01(input.intensity ?? 0.7) }
          : { ...base, external: false, items: [] };
        set((s) => ({ entreno: { ...s.entreno, sessions: [...s.entreno.sessions, session] } }));
        return id;
      },

      updateEntrenoSession: (id, patch) =>
        set((s) => ({
          entreno: {
            ...s.entreno,
            sessions: s.entreno.sessions.map((ss) => {
              if (ss.id !== id) return ss;
              const next = { ...ss } as Session;
              if (patch.modality) next.modality = patch.modality;
              if (patch.location) next.location = patch.location;
              if (patch.name != null) {
                const nm = patch.name.trim();
                if (nm) next.name = nm;
                else delete next.name;
              }
              if (next.external && patch.durationMin != null) next.durationMin = Math.max(0, patch.durationMin);
              if (next.external && patch.intensity != null) next.intensity = clamp01(patch.intensity);
              // Window: explicit patch (null clears) wins; else a start time (re)builds it. For
              // external the end tracks the (possibly just-patched) duration; else start === end.
              if ("window" in patch) {
                if (patch.window) next.window = patch.window;
                else delete next.window;
              } else if (patch.startMin != null) {
                const span = next.external ? next.durationMin : 0;
                next.window = { start: patch.startMin, end: patch.startMin + span };
              } else if (next.external && patch.durationMin != null && next.window) {
                // Editing the duration keeps the existing start but slides the window end.
                next.window = { start: next.window.start, end: next.window.start + next.durationMin };
              }
              return next;
            }),
          },
        })),

      removeEntrenoSession: (id) =>
        set((s) => ({
          entreno: {
            sessions: s.entreno.sessions.filter((ss) => ss.id !== id),
            week: s.entreno.week.map((w) => (w === id ? null : w)),
            records: s.entreno.records.filter((r) => r.sessionId !== id),
          },
        })),

      addEntrenoItem: (sessionId, item) =>
        set((s) => ({
          entreno: {
            ...s.entreno,
            sessions: s.entreno.sessions.map((ss) =>
              ss.id === sessionId && !ss.external
                ? {
                    ...ss,
                    items: ss.items.some((it) => it.exerciseId === item.exerciseId)
                      ? ss.items
                      : [...ss.items, item],
                  }
                : ss,
            ),
          },
        })),

      removeEntrenoItem: (sessionId, exerciseId) =>
        set((s) => ({
          entreno: {
            ...s.entreno,
            sessions: s.entreno.sessions.map((ss) =>
              ss.id === sessionId && !ss.external
                ? { ...ss, items: ss.items.filter((it) => it.exerciseId !== exerciseId) }
                : ss,
            ),
          },
        })),

      setEntrenoWeekDay: (index, sessionId) =>
        set((s) => ({
          entreno: {
            ...s.entreno,
            week: s.entreno.week.map((w, i) => (i === index ? sessionId : w)),
          },
        })),

      logEntrenoSession: (sessionId) =>
        set((s) => ({
          entreno: {
            ...s.entreno,
            records: [
              ...s.entreno.records,
              { id: newId(), sessionId, date: todayKey(), at: new Date().toISOString(), status: "done" },
            ],
          },
        })),

      skipEntrenoSession: (sessionId, reason) =>
        set((s) => ({
          entreno: {
            ...s.entreno,
            records: [
              ...s.entreno.records,
              {
                id: newId(),
                sessionId,
                date: todayKey(),
                at: new Date().toISOString(),
                status: "skipped",
                reason,
              },
            ],
          },
        })),

      setWeekDay: (index, slot) => {
        set((s) => reducers.setWeekDay(s, index, slot));
        get().replan();
      },

      setDayKind: (index, kind) => set((s) => reducers.setDayKind(s, index, kind)),

      setDayOverride: (date, patch) => {
        set((s) => reducers.setDayOverride(s, date, patch));
        if (date === todayKey()) get().replan();
      },

      clearDayOverride: (date) => {
        set((s) => reducers.clearDayOverride(s, date));
        if (date === todayKey()) get().replan();
      },

      toggleEquipment: (id) => {
        set((s) => reducers.toggleEquipment(s, id));
        get().replan();
      },

      setSettings: (patch) => {
        set((s) => reducers.setSettings(s, patch));
        get().replan();
      },

      setThemeMode: (mode) => {
        set((s) => ({ theme: { ...s.theme, mode } }));
        const t = get().theme;
        applyTheme(t.mode, t.accent);
      },

      setAccent: (accent) => {
        set((s) => ({ theme: { ...s.theme, accent } }));
        const t = get().theme;
        applyTheme(t.mode, t.accent);
      },

      setLang: (lang) => {
        set({ lang });
        if (typeof document !== "undefined") document.documentElement.lang = lang;
      },

      setPanelEnabled: (value) => {
        set({ panelEnabled: value });
        void setPanelVisible(value);
      },

      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),

      setSnoozeMinutes: (minutes) =>
        set({ snoozeMinutes: Math.max(5, Math.min(180, minutes)) }),

      setDemoMode: (value) => {
        set({ demoMode: value });
        get().replan();
      },

      setLevelsEnabled: (value) => set({ levelsEnabled: value }),
      setStreakFreeze: (value) => set({ streakFreeze: value }),
      setSyncEnabled: (value) => set({ syncEnabled: value }),

      setFocus: (minutes) =>
        set({ focusUntil: Date.now() + Math.max(1, minutes) * 60_000 }),
      clearFocus: () => set({ focusUntil: null }),

      logFreeSet: (exerciseId, variantId) => {
        set((s) => ({
          logs: [...s.logs, { at: new Date().toISOString(), exerciseId, variantId }],
        }));
      },

      resetSettings: () => {
        set({ settings: DEFAULT_SETTINGS, demoMode: false });
        get().replan();
      },

      resetAll: () => {
        set({
          ownedEquipment: DEFAULT_OWNED,
          dayTypes: DEFAULT_DAYTYPES,
          week: DEFAULT_WEEK,
          dayKind: DEFAULT_DAYKIND,
          dayOverrides: {},
          customExercises: [],
          customEquipment: [],
          settings: DEFAULT_SETTINGS,
          theme: DEFAULT_THEME,
          lang: detectLang(),
          logs: [],
          toastBlockId: null,
          profile: DEFAULT_PROFILE,
          coach: DEFAULT_COACH,
          modules: defaultModules(),
          entreno: defaultEntreno(),
          panelEnabled: true,
          notificationsEnabled: true,
          snoozeMinutes: 30,
          demoMode: false,
          focusUntil: null,
          levelsEnabled: true,
          streakFreeze: false,
          syncEnabled: false,
        });
        applyTheme(DEFAULT_THEME.mode, DEFAULT_THEME.accent);
        get().replan();
        void setPanelVisible(true);
      },

      ensureToday: () => {
        const { day } = get();
        if (!day || day.date !== todayKey()) get().replan();
      },

      replan: () => {
        const { dayTypes, week, dayOverrides, settings, ownedEquipment, demoMode, modules, entreno } = get();
        const slot = effectiveSlot(week, dayOverrides, todayKey());
        const rest = slot === REST;
        const dayType = rest ? undefined : dayTypeById(dayTypes, slot);
        const routine = dayType?.routine ?? [];

        if (demoMode) {
          const demoRoutine = routine.length ? routine : (dayTypes[0]?.routine ?? []);
          set({
            day: {
              date: todayKey(),
              blocks: demoBlocks(demoRoutine, ownedEquipment, nowMinutes()),
              rest: false,
              dayTypeName: dayTypes[0]?.name ?? null,
            },
          });
          return;
        }

        const doable = routine
          .filter((r) => {
            const ex = exerciseById(r.exerciseId);
            return ex ? isAvailable(ex, ownedEquipment) : true;
          })
          .map((r) => ({ ...r, sets: scaleSets(r.sets, dayType?.intensity) })); // intensity = non-destructive volume scale
        // Entreno ON: if today's assigned session has a window (e.g. BJJ 20:00), fold it into
        // the engine's avoidWindows for this day only, so the micro-series don't land on top of
        // it. Derived/per-day — never persisted into settings.avoidWindows (Entreno OFF or no
        // windowed session today → identical to before).
        const sessionWindows: TimeWindow[] = [];
        if (modules.entreno?.enabled) {
          const sid = entreno.week[weekdayOfKey(todayKey())];
          const session = sid ? entreno.sessions.find((ss) => ss.id === sid) : undefined;
          if (session?.window) sessionWindows.push(session.window);
        }
        const planSettings = withAvoidWindows(settings, sessionWindows);
        // The day-type can run in its own window/rest (e.g. an evening session); else global.
        const { blocks } = createDayPlan(doable, effectiveSettings(planSettings, dayType), nowMinutes());
        set({
          day: { date: todayKey(), blocks, rest, dayTypeName: dayType?.name ?? null },
        });
      },

      done: (blockId) => {
        const { day, settings, demoMode } = get();
        if (!day) return;
        const block = day.blocks.find((b) => b.id === blockId);
        const blocks = demoMode
          ? day.blocks.map((b) =>
              b.id === blockId ? { ...b, status: "done" as const, time: nowMinutes() } : b,
            )
          : markDone(day.blocks, blockId, settings, nowMinutes()).blocks;
        set((s) => ({
          day: { ...day, blocks },
          logs: block
            ? [
                ...s.logs,
                {
                  at: new Date().toISOString(),
                  exerciseId: block.exerciseId,
                  variantId: block.variantId,
                },
              ]
            : s.logs,
        }));
      },

      decline: (blockId) => {
        const { day, settings, demoMode } = get();
        if (!day) return;
        const blocks = demoMode
          ? day.blocks.map((b) =>
              b.id === blockId ? { ...b, status: "skipped" as const, time: nowMinutes() } : b,
            )
          : engineDecline(day.blocks, blockId, settings, nowMinutes()).blocks;
        set({ day: { ...day, blocks } });
      },

      snooze: (blockId, minutes) => {
        const { day, settings, demoMode } = get();
        if (!day) return;
        const blocks = demoMode
          ? day.blocks.map((b) =>
              b.id === blockId ? { ...b, status: "skipped" as const, time: nowMinutes() } : b,
            )
          : engineSnooze(day.blocks, blockId, minutes, settings, nowMinutes()).blocks;
        set({ day: { ...day, blocks } });
      },

      skip: (blockId) => {
        const { day, settings } = get();
        if (!day) return;
        const blocks = engineSkip(day.blocks, blockId, settings, nowMinutes()).blocks;
        set({ day: { ...day, blocks } });
      },

      showToast: (blockId) => set({ toastBlockId: blockId }),
      dismissToast: () => set({ toastBlockId: null }),
    }),
    {
      name: "microset-store",
      version: 8,
      migrate: migratePersisted,
      partialize: (s) => ({
        ownedEquipment: s.ownedEquipment,
        dayTypes: s.dayTypes,
        week: s.week,
        dayKind: s.dayKind,
        dayOverrides: s.dayOverrides,
        customExercises: s.customExercises,
        customEquipment: s.customEquipment,
        settings: s.settings,
        day: s.day,
        theme: s.theme,
        lang: s.lang,
        logs: s.logs,
        toastBlockId: s.toastBlockId,
        profile: s.profile,
        coach: s.coach,
        modules: s.modules,
        entreno: s.entreno,
        panelEnabled: s.panelEnabled,
        notificationsEnabled: s.notificationsEnabled,
        snoozeMinutes: s.snoozeMinutes,
        demoMode: s.demoMode,
        focusUntil: s.focusUntil,
        levelsEnabled: s.levelsEnabled,
        streakFreeze: s.streakFreeze,
        syncEnabled: s.syncEnabled,
      }),
    },
  ),
);
