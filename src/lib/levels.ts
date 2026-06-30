/**
 * Niveles — a PURE, optional gamification layer derived entirely from the user's
 * logs + plan + catalog. No React, no Tauri, no store imports: callers pass in the
 * raw data and get back a fully-derived read (streak, RPG attributes, achievements).
 *
 * Nothing here is persisted: levels are a *projection* over the same logs the rest
 * of the app already keeps. Turning the feature off just stops rendering it.
 *
 * The maths intentionally resists "easy-volume farming": each completed set is worth
 * roleWeight(group) × variantDifficulty × dayIntensity, then a per-group/day soft cap
 * (sqrt) so a hundred trivial sets in one day can't outrun honest progression.
 */
import { exerciseGroupRoles, BODY_GROUPS, type BodyGroup } from "@/domain/bodyGroups";
import { intensityById, DEFAULT_INTENSITY, type IntensityId } from "@/domain/intensity";
import type { Exercise, LogEntry } from "@/domain/types";

const DAY = 86_400_000;

// ---- tunables (exposed as consts so the UI + tests agree) --------------------

/** A day "counts" for the streak once you've completed at least this many sets. */
export const DAY_DONE_THRESHOLD = 1;
/** XP needed per level grows quadratically: lvl = floor(sqrt(xp / K_GROUP)). */
const K_GROUP = 40;
/** Same curve for the overall rank, over total XP across all groups. */
const K_RANK = 90;
/** Role → XP weight (primary worth double a secondary), mirrors the body-map weights. */
const ROLE_WEIGHT: Record<"primary" | "secondary", number> = { primary: 1, secondary: 0.5 };

/** Difficulty multiplier for a variant by its index on the exercise's axis (easiest→hardest). */
function variantDifficulty(idx: number): number {
  return 1 + Math.max(0, idx) * 0.25;
}

// ---- inputs ------------------------------------------------------------------

/** What `levels.ts` needs to resolve which day-type (→ intensity) was in effect on a log's date. */
export interface PlanContext {
  /** Day-type intensity by id (so a set logged on a "push" day is worth more). */
  intensityByDayType: Record<string, IntensityId | undefined>;
  /** The day-type slot in effect for a date key `YYYY-M-D` (REST sentinel for rest days). */
  slotForDate: (dateKey: string) => string;
  /** REST sentinel — a planned rest day is neutral for the streak. */
  rest: string;
}

// ---- streak ------------------------------------------------------------------

/** `YYYY-M-D` key (matches the store's todayKey) from an epoch ms. */
function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Current run of consecutive days that meet the "day done" threshold, walking back
 * from today. PLANNED REST days are neutral — they neither extend nor break the run.
 * With `freeze`, a single missed non-rest day is tolerated (one skip, then it breaks).
 */
export function computeStreak(logs: LogEntry[], plan: PlanContext, freeze = false): number {
  const now = Date.now();
  const perDay: Record<string, number> = {};
  for (const l of logs) {
    const k = dayKeyOf(Date.parse(l.at));
    perDay[k] = (perDay[k] ?? 0) + 1;
  }

  let streak = 0;
  let freezeLeft = freeze ? 1 : 0;
  for (let i = 0; i < 366; i++) {
    const ms = now - i * DAY;
    const key = dayKeyOf(ms);
    if (plan.slotForDate(key) === plan.rest) continue; // planned rest: skip, neutral
    const done = (perDay[key] ?? 0) >= DAY_DONE_THRESHOLD;
    if (done) {
      streak++;
    } else if (i === 0) {
      continue; // today not done yet doesn't break a run carried from yesterday
    } else if (freezeLeft > 0) {
      freezeLeft--; // tolerate one missed non-rest day
    } else {
      break;
    }
  }
  return streak;
}

// ---- attributes (RPG character sheet) ----------------------------------------

export interface Attribute {
  group: BodyGroup;
  xp: number; // cumulative, diminished
  level: number;
  /** Progress (0..1) toward the next level, for the bar. */
  progress: number;
}

export interface LevelsSummary {
  attributes: Attribute[];
  totalXp: number;
  /** Overall NIVEL derived from total XP. */
  rank: number;
  /** Progress (0..1) toward the next rank. */
  rankProgress: number;
  /** Total completed sets (all logs) — the headline counter. */
  totalSets: number;
  streak: number;
}

function levelFromXp(xp: number, k: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / k));
}

/** XP threshold to reach a given level on the sqrt curve (inverse of levelFromXp). */
function xpForLevel(level: number, k: number): number {
  return level * level * k;
}

function progressToNext(xp: number, k: number): number {
  const lvl = levelFromXp(xp, k);
  const lo = xpForLevel(lvl, k);
  const hi = xpForLevel(lvl + 1, k);
  return hi > lo ? Math.min(1, Math.max(0, (xp - lo) / (hi - lo))) : 0;
}

/**
 * Cumulative XP per body group over every completed set, with per-group/day soft
 * capping so easy volume can't be farmed: within one day, a group's raw XP is passed
 * through sqrt-shaped diminishing returns before being summed into the total.
 */
export function computeAttributes(
  logs: LogEntry[],
  plan: PlanContext,
  byId: (id: string) => Exercise | undefined,
): { perGroup: Record<BodyGroup, number>; streak?: never } {
  // raw[day][group] accumulates the un-diminished XP, so the cap is per group *per day*.
  const rawByDay: Record<string, Partial<Record<BodyGroup, number>>> = {};

  for (const l of logs) {
    const ex = byId(l.exerciseId);
    if (!ex) continue;
    const dayKey = dayKeyOf(Date.parse(l.at));
    const slot = plan.slotForDate(dayKey);
    const intensity = slot === plan.rest ? DEFAULT_INTENSITY : plan.intensityByDayType[slot];
    const factor = intensityById(intensity ?? DEFAULT_INTENSITY)?.factor ?? 1;

    const idx = ex.axis.findIndex((v) => v.id === l.variantId);
    const diff = variantDifficulty(idx); // idx<0 → 1 (default rung)

    const { primary, secondary } = exerciseGroupRoles(ex);
    const day = (rawByDay[dayKey] ??= {});
    const add = (g: BodyGroup, role: "primary" | "secondary") => {
      day[g] = (day[g] ?? 0) + ROLE_WEIGHT[role] * diff * factor;
    };
    primary.forEach((g) => add(g, "primary"));
    secondary.forEach((g) => add(g, "secondary"));
  }

  const perGroup = Object.fromEntries(BODY_GROUPS.map((g) => [g, 0])) as Record<BodyGroup, number>;
  // Soft cap: each day's raw group XP is dampened (sqrt) before summing — honest
  // frequency across days beats grinding one day.
  for (const day of Object.values(rawByDay)) {
    for (const g of BODY_GROUPS) {
      const raw = day[g] ?? 0;
      if (raw > 0) perGroup[g] += Math.sqrt(raw) * 2;
    }
  }
  return { perGroup };
}

/** The full derived levels read for the Progreso character sheet. */
export function computeLevels(
  logs: LogEntry[],
  plan: PlanContext,
  byId: (id: string) => Exercise | undefined,
  freeze = false,
): LevelsSummary {
  const { perGroup } = computeAttributes(logs, plan, byId);
  const attributes: Attribute[] = BODY_GROUPS.map((group) => {
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

// ---- achievements (derived, currently-earned only — never persisted) ---------

export type AchievementId =
  | "streak7"
  | "streak30"
  | "sets50"
  | "sets250"
  | "sets1000"
  | "groupL3"
  | "groupL5";

export interface Achievement {
  id: AchievementId;
  earned: boolean;
}

/** The catalog, in display order. Each is a pure predicate over the summary. */
const ACHIEVEMENTS: { id: AchievementId; test: (s: LevelsSummary) => boolean }[] = [
  { id: "streak7", test: (s) => s.streak >= 7 },
  { id: "streak30", test: (s) => s.streak >= 30 },
  { id: "sets50", test: (s) => s.totalSets >= 50 },
  { id: "sets250", test: (s) => s.totalSets >= 250 },
  { id: "sets1000", test: (s) => s.totalSets >= 1000 },
  { id: "groupL3", test: (s) => s.attributes.some((a) => a.level >= 3) },
  { id: "groupL5", test: (s) => s.attributes.some((a) => a.level >= 5) },
];

/** Evaluate the achievement catalog against a levels summary (earned = currently true). */
export function computeAchievements(summary: LevelsSummary): Achievement[] {
  return ACHIEVEMENTS.map((a) => ({ id: a.id, earned: a.test(summary) }));
}
