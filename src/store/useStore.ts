import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createDayPlan,
  decline as engineDecline,
  markDone,
  snooze as engineSnooze,
} from "@/lib/engine";
import type { Block, Minute, RoutineItem, Settings } from "@/lib/engine";
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
  exerciseById,
  isAvailable,
} from "@/domain/seed";
import { methodologyById } from "@/domain/methodologies";
import { applyTheme, type Accent, type ThemeConfig, type ThemeMode } from "@/lib/theme";
import { setPanelVisible } from "@/lib/windows";

/** A named routine template that can be assigned to weekdays. */
export interface DayType {
  id: string;
  name: string;
  routine: RoutineItem[];
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
}

export type CoachProviderId = "anthropic" | "local";
export interface CoachConfig {
  provider: CoachProviderId;
  model: string;
  endpoint: string; // for local (OpenAI-compatible) providers
}

const DEFAULT_THEME: ThemeConfig = { mode: "dark", accent: "lime" };
const DEFAULT_METHODOLOGY = "gtg";
const DEFAULT_PROFILE: UserProfile = { goals: "", diet: "", constraints: "" };
const DEFAULT_COACH: CoachConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  endpoint: "http://localhost:11434/v1",
};
const DEFAULT_DAYTYPE_ID = "default";
const DEFAULT_DAYTYPES: DayType[] = [
  { id: DEFAULT_DAYTYPE_ID, name: "Estándar", routine: DEFAULT_ROUTINE },
];
const DEFAULT_WEEK: string[] = Array(7).fill(DEFAULT_DAYTYPE_ID);
const DEFAULT_DAYKIND: (WeekKind | null)[] = Array(7).fill(null);

/** Monday-first weekday index for today (0 = Mon … 6 = Sun). */
function weekdayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

function newId(): string {
  return crypto.randomUUID();
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Current wall-clock time as minutes since midnight (the engine stays pure). */
export function nowMinutes(): Minute {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function dayTypeById(dayTypes: DayType[], id: string): DayType | undefined {
  return dayTypes.find((d) => d.id === id);
}

function updateRoutine(
  dayTypes: DayType[],
  id: string,
  fn: (routine: RoutineItem[]) => RoutineItem[],
): DayType[] {
  return dayTypes.map((d) => (d.id === id ? { ...d, routine: fn(d.routine) } : d));
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
  customExercises: Exercise[];
  customEquipment: Equipment[];
  settings: Settings;
  day: DayPlan | null;
  theme: ThemeConfig;
  logs: LogEntry[];
  methodologyId: string;
  toastBlockId: string | null; // block currently shown in the toast window
  profile: UserProfile; // goals/diet/constraints for the AI coach
  coach: CoachConfig; // provider/model/endpoint for the AI coach

  // preferences
  panelEnabled: boolean;
  notificationsEnabled: boolean;
  snoozeMinutes: number;
  demoMode: boolean;

  // routine editing (per day-type)
  addToRoutine: (dayTypeId: string, item: RoutineItem) => void;
  setRoutineSets: (dayTypeId: string, exerciseId: string, sets: number) => void;
  setRoutineTarget: (dayTypeId: string, exerciseId: string, target: string) => void;
  setRoutineVariant: (dayTypeId: string, exerciseId: string, variantId: string) => void;
  removeFromRoutine: (dayTypeId: string, exerciseId: string) => void;
  applyMethodology: (dayTypeId: string, id: string) => void;

  // day-type management
  addDayType: (name: string) => string;
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

  // week
  setWeekDay: (index: number, slot: string) => void;
  setDayKind: (index: number, kind: WeekKind | null) => void;

  // equipment / settings
  toggleEquipment: (id: EquipmentId) => void;
  setSettings: (patch: Partial<Settings>) => void;

  // theme
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;

  // preferences setters
  setPanelEnabled: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setSnoozeMinutes: (minutes: number) => void;
  setDemoMode: (value: boolean) => void;

  // data
  resetSettings: () => void;
  resetAll: () => void;

  // today / engine
  ensureToday: () => void;
  replan: () => void;
  done: (blockId: string) => void;
  decline: (blockId: string) => void;
  snooze: (blockId: string, minutes: number) => void;

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

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ownedEquipment: DEFAULT_OWNED,
      dayTypes: DEFAULT_DAYTYPES,
      week: DEFAULT_WEEK,
      dayKind: DEFAULT_DAYKIND,
      customExercises: [],
      customEquipment: [],
      settings: DEFAULT_SETTINGS,
      day: null,
      theme: DEFAULT_THEME,
      logs: [],
      methodologyId: DEFAULT_METHODOLOGY,
      toastBlockId: null,
      profile: DEFAULT_PROFILE,
      coach: DEFAULT_COACH,
      panelEnabled: true,
      notificationsEnabled: true,
      snoozeMinutes: 30,
      demoMode: false,

      addToRoutine: (dayTypeId, item) => {
        set((s) => ({
          dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
            r.some((x) => x.exerciseId === item.exerciseId) ? r : [...r, item],
          ),
        }));
        get().replan();
      },

      setRoutineSets: (dayTypeId, exerciseId, sets) => {
        set((s) => ({
          dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
            r.map((x) => (x.exerciseId === exerciseId ? { ...x, sets: Math.max(1, sets) } : x)),
          ),
        }));
        get().replan();
      },

      setRoutineTarget: (dayTypeId, exerciseId, target) => {
        set((s) => ({
          dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
            r.map((x) => (x.exerciseId === exerciseId ? { ...x, target } : x)),
          ),
        }));
      },

      setRoutineVariant: (dayTypeId, exerciseId, variantId) => {
        set((s) => ({
          dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
            r.map((x) => (x.exerciseId === exerciseId ? { ...x, variantId } : x)),
          ),
        }));
        get().replan();
      },

      removeFromRoutine: (dayTypeId, exerciseId) => {
        set((s) => ({
          dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
            r.filter((x) => x.exerciseId !== exerciseId),
          ),
        }));
        get().replan();
      },

      applyMethodology: (dayTypeId, id) => {
        const m = methodologyById(id);
        if (!m || m.sets === 0) {
          set({ methodologyId: id });
        } else {
          set((s) => ({
            methodologyId: id,
            dayTypes: updateRoutine(s.dayTypes, dayTypeId, (r) =>
              r.map((x) => ({ ...x, sets: m.sets })),
            ),
            settings: { ...s.settings, minRest: m.minRest },
          }));
        }
        get().replan();
      },

      addDayType: (name) => {
        const id = newId();
        set((s) => ({ dayTypes: [...s.dayTypes, { id, name, routine: [] }] }));
        return id;
      },

      renameDayType: (id, name) =>
        set((s) => ({
          dayTypes: s.dayTypes.map((d) => (d.id === id ? { ...d, name } : d)),
        })),

      removeDayType: (id) => {
        set((s) => {
          if (s.dayTypes.length <= 1) return s;
          const dayTypes = s.dayTypes.filter((d) => d.id !== id);
          const fallback = dayTypes[0].id;
          const week = s.week.map((slot) => (slot === id ? fallback : slot));
          return { dayTypes, week };
        });
        get().replan();
      },

      addCustomExercise: (input) => {
        const ex: Exercise = {
          id: newId(),
          name: input.name,
          equipment: input.equipment,
          muscle: input.muscle,
          measure: input.measure,
          context: input.context,
          defaultSets: 3,
          defaultReps: input.defaultReps,
          axis: [{ id: "bw", label: "Peso corporal", kind: "bodyweight" }],
        };
        set((s) => ({ customExercises: [...s.customExercises, ex] }));
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
        const eq: Equipment = { id: newId(), name: name.trim() };
        set((s) => ({
          customEquipment: [...s.customEquipment, eq],
          ownedEquipment: [...s.ownedEquipment, eq.id], // you own what you add
        }));
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

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setCoachConfig: (patch) => set((s) => ({ coach: { ...s.coach, ...patch } })),

      setWeekDay: (index, slot) => {
        set((s) => ({ week: s.week.map((v, i) => (i === index ? slot : v)) }));
        get().replan();
      },

      setDayKind: (index, kind) =>
        set((s) => ({ dayKind: s.dayKind.map((v, i) => (i === index ? kind : v)) })),

      toggleEquipment: (id) => {
        set((s) => ({
          ownedEquipment: s.ownedEquipment.includes(id)
            ? s.ownedEquipment.filter((e) => e !== id)
            : [...s.ownedEquipment, id],
        }));
        get().replan();
      },

      setSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
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
          customExercises: [],
          customEquipment: [],
          settings: DEFAULT_SETTINGS,
          theme: DEFAULT_THEME,
          logs: [],
          methodologyId: DEFAULT_METHODOLOGY,
          toastBlockId: null,
          profile: DEFAULT_PROFILE,
          coach: DEFAULT_COACH,
          panelEnabled: true,
          notificationsEnabled: true,
          snoozeMinutes: 30,
          demoMode: false,
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
        const { dayTypes, week, settings, ownedEquipment, demoMode } = get();
        const slot = week[weekdayIndex()];
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

        const doable = routine.filter((r) => {
          const ex = exerciseById(r.exerciseId);
          return ex ? isAvailable(ex, ownedEquipment) : true;
        });
        const { blocks } = createDayPlan(doable, settings, nowMinutes());
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

      showToast: (blockId) => set({ toastBlockId: blockId }),
      dismissToast: () => set({ toastBlockId: null }),
    }),
    {
      name: "microset-store",
      version: 1,
      migrate: (persisted, version) => {
        const p = persisted as Record<string, unknown>;
        if (p && (version < 1 || !p.dayTypes)) {
          const routine = (p.routine as RoutineItem[]) ?? DEFAULT_ROUTINE;
          p.dayTypes = [{ id: DEFAULT_DAYTYPE_ID, name: "Estándar", routine }];
          p.week = Array(7).fill(DEFAULT_DAYTYPE_ID);
          p.dayKind = Array(7).fill(null);
          delete p.routine;
        }
        return p;
      },
      partialize: (s) => ({
        ownedEquipment: s.ownedEquipment,
        dayTypes: s.dayTypes,
        week: s.week,
        dayKind: s.dayKind,
        customExercises: s.customExercises,
        customEquipment: s.customEquipment,
        settings: s.settings,
        day: s.day,
        theme: s.theme,
        logs: s.logs,
        methodologyId: s.methodologyId,
        toastBlockId: s.toastBlockId,
        profile: s.profile,
        coach: s.coach,
        panelEnabled: s.panelEnabled,
        notificationsEnabled: s.notificationsEnabled,
        snoozeMinutes: s.snoozeMinutes,
        demoMode: s.demoMode,
      }),
    },
  ),
);
