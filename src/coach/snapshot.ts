import { EXERCISES, defaultVariantId } from "@/domain/seed";
import { MUSCLE_LABEL, type Exercise, type MuscleGroup } from "@/domain/types";
import { DEFAULT_INTENSITY, scaleSets } from "@/domain/intensity";
import { useStore, type DayType } from "@/store/useStore";
import { analyzeRoutine } from "./analysis";

const REST = "rest";
const DAY = 86_400_000;
const LEVEL_UP = 8; // sets at the current level (14d) to suggest the next
const GROUPS: MuscleGroup[] = ["pull", "push", "core", "legs"];

/** A compact, actionable read of the user's state for the Coach view header. */
export interface CoachSnapshot {
  activeDays: number;
  todayName: string | null;
  feasibilityOk: boolean;
  overflow: string[]; // day-type names whose volume doesn't fit
  balance: Record<MuscleGroup, number>; // today's (or first active) day-type
  balanceLabel: string;
  readyToLevel: string[]; // exercise names ready to level up
  thisWeekSets: number;
}

export function coachSnapshot(): CoachSnapshot {
  const s = useStore.getState();
  const all: Exercise[] = [...EXERCISES, ...s.customExercises];
  const byId = (id: string) => all.find((e) => e.id === id);

  const activeDays = s.week.filter((w) => w !== REST).length;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todaySlot = s.week[todayIdx];
  const todayDT = todaySlot === REST ? undefined : s.dayTypes.find((d) => d.id === todaySlot);
  const todayName = todaySlot === REST ? "Descanso" : (todayDT?.name ?? null);

  // Judge feasibility/balance on the SCHEDULED sets (after intensity), like the engine and
  // the coach context do — not the raw configured sets. Otherwise the badge disagrees with
  // what the day actually schedules (e.g. a deload day reads as "won't fit" when it does).
  const analyzeDay = (dt: DayType) => {
    const scheduled = dt.routine.map((r) => ({ ...r, sets: scaleSets(r.sets, dt.intensity ?? DEFAULT_INTENSITY) }));
    return analyzeRoutine(scheduled, s.ownedEquipment, s.settings, byId);
  };

  const usedIds = new Set(s.week.filter((w) => w !== REST));
  const overflow: string[] = [];
  for (const dt of s.dayTypes) {
    if (!usedIds.has(dt.id)) continue;
    if (!analyzeDay(dt).allFit) overflow.push(dt.name);
  }

  const balDT = todayDT ?? s.dayTypes.find((d) => usedIds.has(d.id)) ?? s.dayTypes[0];
  const balance = balDT ? analyzeDay(balDT).balance : { pull: 0, push: 0, core: 0, legs: 0 };
  const missing = GROUPS.filter((g) => balance[g] === 0);
  const hasAny = GROUPS.some((g) => balance[g] > 0);
  const balanceLabel = !hasAny
    ? "Sin volumen"
    : missing.length
      ? `Falta ${missing.map((g) => MUSCLE_LABEL[g]).join(", ")}`
      : "Equilibrado";

  const now = Date.now();
  const lastVariant: Record<string, string | undefined> = {};
  for (const l of s.logs) lastVariant[l.exerciseId] = l.variantId ?? lastVariant[l.exerciseId];
  const readyToLevel: string[] = [];
  for (const [id, variant] of Object.entries(lastVariant)) {
    const ex = byId(id);
    if (!ex || ex.axis.length <= 1) continue;
    const cur = variant ?? defaultVariantId(ex);
    const idx = ex.axis.findIndex((v) => v.id === cur);
    if (idx < 0 || idx >= ex.axis.length - 1) continue;
    const recent = s.logs.filter(
      (l) => l.exerciseId === id && l.variantId === cur && Date.parse(l.at) >= now - 14 * DAY,
    ).length;
    if (recent >= LEVEL_UP) readyToLevel.push(ex.name);
  }

  const thisWeekSets = s.logs.filter((l) => Date.parse(l.at) >= now - 7 * DAY).length;

  return {
    activeDays,
    todayName,
    feasibilityOk: overflow.length === 0,
    overflow,
    balance,
    balanceLabel,
    readyToLevel,
    thisWeekSets,
  };
}
