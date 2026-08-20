import { describe, it, expect } from "vitest";
import { BODY_GROUPS, exerciseGroupRoles, type BodyGroup } from "@/domain/bodyGroups";
import { intensityById, DEFAULT_INTENSITY, type IntensityId } from "@/domain/intensity";
import type { Exercise, LogEntry } from "@/domain/types";
import { computeLevels, computeStreak, type PlanContext, type LevelsSummary } from "./levels";

/**
 * Guards the Fase 1 dedup: extracting the per-series primitive (roleWeight × variantDifficulty)
 * into the shared `setRoleXp` must NOT move any number in Progreso. `refComputeLevels` below is a
 * self-contained copy of the PRE-dedup arithmetic (the exact `ROLE_WEIGHT[role] * diff * factor`
 * order, sqrt soft-cap and sqrt level curve); we assert `computeLevels` still equals it bit-for-bit.
 */

const K_GROUP = 40;
const K_RANK = 90;
const REF_ROLE_WEIGHT: Record<"primary" | "secondary", number> = { primary: 1, secondary: 0.5 };
function refVariantDifficulty(idx: number): number {
  return 1 + Math.max(0, idx) * 0.25;
}
function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function levelFromXp(xp: number, k: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / k));
}
function xpForLevel(level: number, k: number): number {
  return level * level * k;
}
function progressToNext(xp: number, k: number): number {
  const lvl = levelFromXp(xp, k);
  const lo = xpForLevel(lvl, k);
  const hi = xpForLevel(lvl + 1, k);
  return hi > lo ? Math.min(1, Math.max(0, (xp - lo) / (hi - lo))) : 0;
}

/** The ORIGINAL (pre-dedup) computeLevels, replicated here as the equality oracle. */
function refComputeLevels(
  logs: LogEntry[],
  plan: PlanContext,
  byId: (id: string) => Exercise | undefined,
  freeze = false,
): LevelsSummary {
  const rawByDay: Record<string, Partial<Record<BodyGroup, number>>> = {};
  for (const l of logs) {
    const ex = byId(l.exerciseId);
    if (!ex) continue;
    const dayKey = dayKeyOf(Date.parse(l.at));
    const slot = plan.slotForDate(dayKey);
    const intensity = slot === plan.rest ? DEFAULT_INTENSITY : plan.intensityByDayType[slot];
    const factor = intensityById(intensity ?? DEFAULT_INTENSITY)?.factor ?? 1;
    const idx = ex.axis.findIndex((v) => v.id === l.variantId);
    const diff = refVariantDifficulty(idx);
    const { primary, secondary } = exerciseGroupRoles(ex);
    const day = (rawByDay[dayKey] ??= {});
    const add = (g: BodyGroup, role: "primary" | "secondary") => {
      day[g] = (day[g] ?? 0) + REF_ROLE_WEIGHT[role] * diff * factor;
    };
    primary.forEach((g) => add(g, "primary"));
    secondary.forEach((g) => add(g, "secondary"));
  }
  const perGroup = Object.fromEntries(BODY_GROUPS.map((g) => [g, 0])) as Record<BodyGroup, number>;
  for (const day of Object.values(rawByDay)) {
    for (const g of BODY_GROUPS) {
      const raw = day[g] ?? 0;
      if (raw > 0) perGroup[g] += Math.sqrt(raw) * 2;
    }
  }
  const attributes = BODY_GROUPS.map((group) => {
    const xp = perGroup[group];
    return { group, xp, level: levelFromXp(xp, K_GROUP), progress: progressToNext(xp, K_GROUP) };
  });
  const totalXp = attributes.reduce((n, a) => n + a.xp, 0);
  return {
    attributes,
    totalXp,
    rank: levelFromXp(totalXp, K_RANK),
    rankProgress: progressToNext(totalXp, K_RANK),
    totalSets: logs.length,
    streak: computeStreak(logs, plan, freeze),
  };
}

// ---- fixtures ----------------------------------------------------------------

// PULL: a group ("back") is hit by TWO primary fine-muscles → two contributions to one group,
// the float path most likely to drift if the multiply order changed. ARMS is a secondary group.
const PULL: Exercise = {
  id: "pull",
  name: "Pull",
  equipment: [],
  muscle: "pull",
  primary: ["upper-back", "trapezius"], // both → group "back"
  secondary: ["biceps"], //                 → group "arms"
  measure: "reps",
  defaultSets: 3,
  defaultReps: "5",
  axis: [
    { id: "easy", label: "Easy", kind: "assist" },
    { id: "mid", label: "Mid", kind: "bodyweight" },
    { id: "hard", label: "Hard", kind: "load" },
  ],
};
const PUSH: Exercise = {
  id: "push",
  name: "Push",
  equipment: [],
  muscle: "push",
  primary: ["chest", "triceps"], // chest→"chest", triceps→"arms"
  secondary: ["front-deltoids"], // → group "shoulders"
  measure: "reps",
  defaultSets: 3,
  defaultReps: "8",
  axis: [
    { id: "knees", label: "Knees", kind: "assist" },
    { id: "full", label: "Full", kind: "bodyweight" },
  ],
};
const CATALOG: Record<string, Exercise> = { pull: PULL, push: PUSH };
const byId = (id: string): Exercise | undefined => CATALOG[id];

// A dense fixture spanning three days across three day-types (normal / push=1.5 / deload=0.5),
// with unknown-exercise + unknown-variant logs mixed in.
const logs: LogEntry[] = [
  { at: "2026-08-18T09:00:00.000Z", exerciseId: "pull", variantId: "hard" },
  { at: "2026-08-18T10:00:00.000Z", exerciseId: "push", variantId: "full" },
  { at: "2026-08-18T11:00:00.000Z", exerciseId: "pull", variantId: "easy" },
  { at: "2026-08-19T09:00:00.000Z", exerciseId: "push", variantId: "knees" },
  { at: "2026-08-19T12:00:00.000Z", exerciseId: "pull", variantId: "mid" },
  { at: "2026-08-19T13:00:00.000Z", exerciseId: "pull", variantId: "hard" },
  { at: "2026-08-20T08:00:00.000Z", exerciseId: "push", variantId: "full" },
  { at: "2026-08-20T08:30:00.000Z", exerciseId: "pull" }, // no variant → idx<0 → diff 1
  { at: "2026-08-20T09:00:00.000Z", exerciseId: "ghost", variantId: "x" }, // unknown → skipped
];

const intensityByDayType: Record<string, IntensityId> = {
  "day-normal": "normal",
  "day-push": "push",
  "day-deload": "deload",
};
const slotByDate: Record<string, string> = {
  "2026-8-18": "day-normal",
  "2026-8-19": "day-push",
  "2026-8-20": "day-deload",
};
const plan: PlanContext = {
  intensityByDayType,
  slotForDate: (key) => slotByDate[key] ?? "rest",
  rest: "rest",
};

describe("levels — behavior-preserving dedup of the per-series XP primitive", () => {
  it("computeLevels equals the pre-dedup reference bit-for-bit (normal/push/deload, multi-group)", () => {
    for (const freeze of [false, true]) {
      expect(computeLevels(logs, plan, byId, freeze)).toEqual(refComputeLevels(logs, plan, byId, freeze));
    }
  });

  it("matches the reference on a single-log and on an all-unknown fixture", () => {
    const one: LogEntry[] = [{ at: "2026-08-18T09:00:00.000Z", exerciseId: "pull", variantId: "mid" }];
    expect(computeLevels(one, plan, byId)).toEqual(refComputeLevels(one, plan, byId));
    const none: LogEntry[] = [{ at: "2026-08-18T09:00:00.000Z", exerciseId: "ghost" }];
    expect(computeLevels(none, plan, byId)).toEqual(refComputeLevels(none, plan, byId));
  });

  it("produces the expected absolute XP numbers (timezone-independent anchor)", () => {
    // A single PULL-hard set on a constant normal (factor 1) plan: one log → one day, so the
    // day-key timezone is irrelevant. hard = axis idx 2 → variantDifficulty 1+2×0.25 = 1.5.
    // PULL: primary group "back" (1×1.5), secondary "arms" (0.5×1.5=0.75); each group hit once
    // → raw = the term, then the sqrt soft-cap ×2.
    const one: LogEntry[] = [{ at: "2026-08-18T12:00:00.000Z", exerciseId: "pull", variantId: "hard" }];
    const flat: PlanContext = { intensityByDayType: {}, slotForDate: () => "day-normal", rest: "rest" };
    const s = computeLevels(one, flat, byId);
    expect(s.attributes.find((a) => a.group === "back")!.xp).toBeCloseTo(Math.sqrt(1.5) * 2, 12);
    expect(s.attributes.find((a) => a.group === "arms")!.xp).toBeCloseTo(Math.sqrt(0.75) * 2, 12);
  });
});
