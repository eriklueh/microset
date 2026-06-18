import { EXERCISES, defaultVariantId } from "@/domain/seed";
import { MUSCLE_LABEL, type Exercise, type MuscleGroup } from "@/domain/types";
import { DEFAULT_INTENSITY, scaleSets } from "@/domain/intensity";
import { useStore, type DayType } from "@/store/useStore";
import { analyzeRoutine } from "./analysis";

const REST = "rest";
const DAY = 86_400_000;
const LEVEL_UP = 8; // sets at the current level (14d) to suggest the next
const GROUPS: MuscleGroup[] = ["pull", "push", "core", "legs"];

/** A pattern the coach noticed in your real logs, worth a proactive nudge. */
export type CoachAlert =
  | { kind: "inactive"; days: number } // n days since the last logged set
  | { kind: "neglected"; group: MuscleGroup } // planned but untrained in 14d
  | { kind: "volumeDown"; pct: number }; // this week vs the previous one

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
  alerts: CoachAlert[]; // proactive nudges derived from logs + plan
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

  // ----- proactive alerts: patterns worth nudging about, all from real logs + plan -----
  const recent14 = s.logs.filter((l) => Date.parse(l.at) >= now - 14 * DAY);
  const lastWeekSets = s.logs.filter((l) => {
    const x = Date.parse(l.at);
    return x >= now - 14 * DAY && x < now - 7 * DAY;
  }).length;

  // Groups the user actually plans (any day-type routine) vs groups trained in the last 14d.
  const plannedGroups = new Set<MuscleGroup>();
  for (const dt of s.dayTypes) for (const r of dt.routine) byId(r.exerciseId) && plannedGroups.add(byId(r.exerciseId)!.muscle);
  const loggedGroups = new Set<MuscleGroup>();
  for (const l of recent14) byId(l.exerciseId) && loggedGroups.add(byId(l.exerciseId)!.muscle);
  const neglected = GROUPS.filter((g) => plannedGroups.has(g) && !loggedGroups.has(g));

  const lastLogAt = s.logs.reduce((m, l) => Math.max(m, Date.parse(l.at)), 0);
  const daysSinceLast = lastLogAt ? Math.floor((now - lastLogAt) / DAY) : undefined;

  const alerts: CoachAlert[] = [];
  if (daysSinceLast !== undefined && daysSinceLast >= 2) alerts.push({ kind: "inactive", days: daysSinceLast });
  if (recent14.length > 0 && neglected.length) alerts.push({ kind: "neglected", group: neglected[0] });
  if (lastWeekSets >= 4 && thisWeekSets < lastWeekSets * 0.6)
    alerts.push({ kind: "volumeDown", pct: Math.round((1 - thisWeekSets / lastWeekSets) * 100) });

  return {
    activeDays,
    todayName,
    feasibilityOk: overflow.length === 0,
    overflow,
    balance,
    balanceLabel,
    readyToLevel,
    thisWeekSets,
    alerts,
  };
}
