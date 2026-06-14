import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createDayPlan,
  decline as engineDecline,
  markDone,
  snooze as engineSnooze,
} from "@/lib/engine";
import type { Block, Minute, RoutineItem, Settings } from "@/lib/engine";
import type { EquipmentId, LogEntry } from "@/domain/types";
import {
  DEFAULT_OWNED,
  DEFAULT_ROUTINE,
  DEFAULT_SETTINGS,
  exerciseById,
  isAvailable,
} from "@/domain/seed";
import { applyTheme, type Accent, type ThemeConfig, type ThemeMode } from "@/lib/theme";
import { setPanelVisible } from "@/lib/windows";

/** Demo mode: schedule from "now", ignoring the work window, with short rest. */
const DEMO_SETTINGS: Settings = {
  workWindow: { start: 0, end: 24 * 60 },
  minRest: 2,
  avoidWindows: [],
};

const DEFAULT_THEME: ThemeConfig = { mode: "dark", accent: "lime" };

/** Local date key (YYYY-M-D) used to detect day rollover. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Current wall-clock time as minutes since midnight (the engine stays pure). */
export function nowMinutes(): Minute {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

interface DayPlan {
  date: string;
  blocks: Block[];
}

interface State {
  ownedEquipment: EquipmentId[];
  routine: RoutineItem[];
  settings: Settings;
  day: DayPlan | null;
  theme: ThemeConfig;
  logs: LogEntry[];

  // preferences
  panelEnabled: boolean;
  notificationsEnabled: boolean;
  snoozeMinutes: number;
  demoMode: boolean;

  // editing
  toggleEquipment: (id: EquipmentId) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addToRoutine: (item: RoutineItem) => void;
  setRoutineSets: (exerciseId: string, sets: number) => void;
  setRoutineTarget: (exerciseId: string, target: string) => void;
  setRoutineVariant: (exerciseId: string, variantId: string) => void;
  removeFromRoutine: (exerciseId: string) => void;

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
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ownedEquipment: DEFAULT_OWNED,
      routine: DEFAULT_ROUTINE,
      settings: DEFAULT_SETTINGS,
      day: null,
      theme: DEFAULT_THEME,
      logs: [],
      panelEnabled: true,
      notificationsEnabled: true,
      snoozeMinutes: 30,
      demoMode: false,

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

      addToRoutine: (item) => {
        set((s) =>
          s.routine.some((r) => r.exerciseId === item.exerciseId)
            ? s
            : { routine: [...s.routine, item] },
        );
        get().replan();
      },

      setRoutineSets: (exerciseId, sets) => {
        set((s) => ({
          routine: s.routine.map((r) =>
            r.exerciseId === exerciseId ? { ...r, sets: Math.max(1, sets) } : r,
          ),
        }));
        get().replan();
      },

      setRoutineTarget: (exerciseId, target) => {
        set((s) => ({
          routine: s.routine.map((r) =>
            r.exerciseId === exerciseId ? { ...r, target } : r,
          ),
        }));
      },

      setRoutineVariant: (exerciseId, variantId) => {
        set((s) => ({
          routine: s.routine.map((r) =>
            r.exerciseId === exerciseId ? { ...r, variantId } : r,
          ),
        }));
        get().replan();
      },

      removeFromRoutine: (exerciseId) => {
        set((s) => ({
          routine: s.routine.filter((r) => r.exerciseId !== exerciseId),
        }));
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
          routine: DEFAULT_ROUTINE,
          settings: DEFAULT_SETTINGS,
          theme: DEFAULT_THEME,
          logs: [],
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
        const { routine, settings, ownedEquipment, demoMode } = get();
        const doable = routine.filter((r) => {
          const ex = exerciseById(r.exerciseId);
          return ex ? isAvailable(ex, ownedEquipment) : true;
        });
        const base = demoMode ? DEMO_SETTINGS : settings;
        const { blocks } = createDayPlan(doable, base, nowMinutes());
        set({ day: { date: todayKey(), blocks } });
      },

      done: (blockId) => {
        const { day, settings } = get();
        if (!day) return;
        const block = day.blocks.find((b) => b.id === blockId);
        const { blocks } = markDone(day.blocks, blockId, settings, nowMinutes());
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
        const { day, settings } = get();
        if (!day) return;
        const { blocks } = engineDecline(day.blocks, blockId, settings, nowMinutes());
        set({ day: { ...day, blocks } });
      },

      snooze: (blockId, minutes) => {
        const { day, settings } = get();
        if (!day) return;
        const { blocks } = engineSnooze(day.blocks, blockId, minutes, settings, nowMinutes());
        set({ day: { ...day, blocks } });
      },
    }),
    {
      name: "microset-store",
      partialize: (s) => ({
        ownedEquipment: s.ownedEquipment,
        routine: s.routine,
        settings: s.settings,
        day: s.day,
        theme: s.theme,
        logs: s.logs,
        panelEnabled: s.panelEnabled,
        notificationsEnabled: s.notificationsEnabled,
        snoozeMinutes: s.snoozeMinutes,
        demoMode: s.demoMode,
      }),
    },
  ),
);
