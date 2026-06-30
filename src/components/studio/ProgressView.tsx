import { ArrowDown, ArrowUp, ChevronUp, Minus } from "lucide-react";
import { useMemo } from "react";
import { defaultVariantId } from "@/domain/seed";
import { aggregateState, workedGroupCount, type BodyGroup } from "@/domain/bodyGroups";
import type { RoutineItem } from "@/lib/engine";
import type { Exercise, LogEntry } from "@/domain/types";
import {
  computeAchievements,
  computeLevels,
  type Achievement,
  type LevelsSummary,
  type PlanContext,
} from "@/lib/levels";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { effectiveSlot, REST, useStore } from "@/store/useStore";
import { BodyLegend, ModelRail } from "./BodyMap";
import { SectionRule } from "./hud";
import { ViewHeader } from "./shell";

const DAY = 86_400_000;
const WARN = "#e0a400";
/** Sets at the current level (last 14 days) needed to suggest the next level. */
const LEVEL_UP_THRESHOLD = 8;

function isoAgo(daysAgo: number, now: number): string {
  return new Date(now - daysAgo * DAY).toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function ProgressView() {
  const logs = useStore((s) => s.logs);
  const owned = useStore((s) => s.ownedEquipment);
  const levelsEnabled = useStore((s) => s.levelsEnabled);
  const streakFreeze = useStore((s) => s.streakFreeze);
  const week = useStore((s) => s.week);
  const dayOverrides = useStore((s) => s.dayOverrides);
  const dayTypes = useStore((s) => s.dayTypes);
  const setRoutineVariant = useStore((s) => s.setRoutineVariant);
  const { byId } = useCatalog();
  const t = useT();

  // Pure plan context for the levels module — resolves the day-type (→ intensity) in
  // effect for any date, with planned-rest days treated as neutral for the streak.
  const plan = useMemo<PlanContext>(
    () => ({
      intensityByDayType: Object.fromEntries(dayTypes.map((d) => [d.id, d.intensity])),
      slotForDate: (key) => effectiveSlot(week, dayOverrides, key),
      rest: REST,
    }),
    [dayTypes, week, dayOverrides],
  );
  const levels = useMemo<LevelsSummary | null>(
    () => (levelsEnabled ? computeLevels(logs, plan, byId, streakFreeze) : null),
    [levelsEnabled, logs, plan, byId, streakFreeze],
  );

  /** One-tap level up: bump the variant in every day-type whose routine holds this exercise. */
  const levelUp = (exerciseId: string, variantId: string) => {
    for (const dt of dayTypes) {
      if (dt.routine.some((r) => r.exerciseId === exerciseId)) {
        setRoutineVariant(dt.id, exerciseId, variantId);
      }
    }
  };

  if (logs.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <ViewHeader kicker={t.progress.sub} title={t.progress.title} />
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md border border-[var(--rule2)] p-8 text-center text-[13px] leading-[1.6] text-[var(--faint)]">
            {t.progress.emptyBefore}{" "}
            <span className="font-semibold text-[var(--fg)]">{t.progress.emptyDoneWord}</span>{" "}
            {t.progress.emptyAfter}
          </div>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const inLast7 = (l: LogEntry) => Date.parse(l.at) >= now - 7 * DAY;
  const inPrev7 = (l: LogEntry) => {
    const t = Date.parse(l.at);
    return t >= now - 14 * DAY && t < now - 7 * DAY;
  };

  const thisWeek = logs.filter(inLast7).length;
  const lastWeek = logs.filter(inPrev7).length;
  const activeExercises = new Set(logs.map((l) => l.exerciseId)).size;

  const activeDays = new Set(logs.map((l) => l.at.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    if (activeDays.has(isoAgo(i, now))) streak++;
    else if (i === 0) continue;
    else break;
  }

  const ids = Array.from(new Set(logs.map((l) => l.exerciseId)));

  // Last-7-days muscle heatmap: one item per exercise, sets = sets logged this week.
  const counts7: Record<string, number> = {};
  for (const l of logs) if (inLast7(l)) counts7[l.exerciseId] = (counts7[l.exerciseId] ?? 0) + 1;
  const load7: RoutineItem[] = Object.entries(counts7).map(([exerciseId, sets]) => ({ exerciseId, name: "", sets }));
  const aggState = aggregateState(load7, byId, owned);
  const worked = workedGroupCount(aggState);

  return (
    <div className="flex h-full flex-col">
      <ViewHeader kicker={t.progress.sub} title={t.progress.title} />
      <div className="flex min-h-0 flex-1">
        {/* LEFT RAIL — what you trained in the last 7 days (anchored, shared ModelRail) */}
        <ModelRail
          label={t.progress.last7days}
          meta={
            <>
              <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
              {t.body.live}
            </>
          }
          state={aggState}
        >
          <BodyLegend />
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-pixel text-[30px] leading-[0.8] tabular-nums text-[var(--fg)]">{worked}</span>
            <span className="font-pixel text-[16px] tabular-nums text-[var(--faint2)]">/6</span>
            <span className="ml-auto self-end font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
              {t.body.coverage}
            </span>
          </div>
        </ModelRail>

        {/* RIGHT PANE — metrics + per-exercise progress (scrolls) */}
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          <div className="grid grid-cols-3 border border-[var(--rule2)]">
            <Metric
              label={t.progress.weekLabel}
              value={thisWeek}
              unit={t.progress.sets}
              delta={thisWeek - lastWeek}
              first
            />
            <Metric
              label={t.progress.streakLabel}
              value={streak}
              unit={streak === 1 ? t.progress.day : t.progress.days}
            />
            <Metric label={t.progress.activeLabel} value={activeExercises} unit={t.progress.exercises} />
          </div>

          {levels && <LevelsPanel levels={levels} />}

          <div className="mt-3 flex flex-col gap-3">
            {ids.map((id) => {
              const ex = byId(id);
              if (!ex) return null;
              return (
                <ExerciseProgress
                  key={id}
                  ex={ex}
                  logs={logs.filter((l) => l.exerciseId === id)}
                  now={now}
                  inLast7={inLast7}
                  inPrev7={inPrev7}
                  onLevelUp={levels ? levelUp : undefined}
                />
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function ExerciseProgress({
  ex,
  logs,
  now,
  inLast7,
  inPrev7,
  onLevelUp,
}: {
  ex: Exercise;
  logs: LogEntry[];
  now: number;
  inLast7: (l: LogEntry) => boolean;
  inPrev7: (l: LogEntry) => boolean;
  /** When set, the "ready" nudge gets a one-tap button that bumps the routine variant. */
  onLevelUp?: (exerciseId: string, variantId: string) => void;
}) {
  const t = useT();
  const { name, variantLabel } = useCatalog();
  const sorted = [...logs].sort((a, b) => (a.at < b.at ? -1 : 1));
  const lastLog = sorted[sorted.length - 1];
  const currentVariantId = lastLog?.variantId ?? defaultVariantId(ex);
  const currentIdx = Math.max(
    0,
    ex.axis.findIndex((v) => v.id === currentVariantId),
  );
  const currentLabel = ex.axis[currentIdx] ? variantLabel(ex.id, ex.axis[currentIdx].id) : "";
  const nextVariantId = ex.axis[currentIdx + 1]?.id;
  const nextLabel = nextVariantId ? variantLabel(ex.id, nextVariantId) : undefined;

  let reachedAt: string | undefined;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].variantId === currentVariantId) reachedAt = sorted[i].at;
    else break;
  }

  const recentAtCurrent = logs.filter(
    (l) => l.variantId === currentVariantId && Date.parse(l.at) >= now - 14 * DAY,
  ).length;
  const readyToLevel = !!nextLabel && recentAtCurrent >= LEVEL_UP_THRESHOLD;

  const days = Array.from({ length: 7 }, (_, i) => isoAgo(6 - i, now));
  const counts = days.map((d) => logs.filter((l) => l.at.slice(0, 10) === d).length);
  const max = Math.max(1, ...counts);
  const wkThis = logs.filter(inLast7).length;
  const wkPrev = logs.filter(inPrev7).length;

  return (
    <div className="border border-[var(--rule2)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
          {name(ex.id)}
        </span>
        <span className="font-mono text-[11px] text-[var(--faint)]">
          {logs.length} {t.progress.sets}
        </span>
      </div>

      {ex.axis.length > 1 && (
        <div className="mt-3">
          <div className="flex items-end gap-1">
            {ex.axis.map((v, i) => (
              <div
                key={v.id}
                className="flex-1"
                style={{
                  height: i === currentIdx ? "10px" : "6px",
                  background: i <= currentIdx ? "var(--acc)" : "var(--bar0)",
                  opacity: i < currentIdx ? 0.5 : 1,
                }}
              />
            ))}
          </div>
          <div className="mt-2 font-mono text-[11px] tracking-[0.03em]">
            <span className="text-[var(--fg)]">
              {t.progress.youreAt} {currentLabel.toUpperCase()}
            </span>
            {reachedAt && (
              <span className="text-[var(--faint)]">
                {" "}
                · {t.progress.since} {shortDate(reachedAt)}
              </span>
            )}
            <span className="text-[var(--faint)]">
              {nextLabel
                ? ` · ${t.progress.nextLevel} ${nextLabel.toUpperCase()}`
                : ` · ${t.progress.maxLevel}`}
            </span>
          </div>
          {readyToLevel && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-block bg-[var(--acc)] px-2.5 py-1 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-[var(--on)]">
                {t.progress.ready} {nextLabel!.toUpperCase()}
              </span>
              {onLevelUp && nextVariantId && (
                <button
                  onClick={() => onLevelUp(ex.id, nextVariantId)}
                  aria-label={t.progress.levelUpAria}
                  className="inline-flex items-center gap-1 border border-[var(--acc)] px-2.5 py-1 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-[var(--fg)] hover:bg-[var(--acc)] hover:text-[var(--on)]"
                >
                  <ChevronUp className="size-3" />
                  {t.progress.levelUp}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3.5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-[var(--faint)]">
            {t.progress.last7days}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-[var(--fg)]">
              {wkThis} {t.progress.sets}
            </span>
            <Delta value={wkThis - wkPrev} />
          </span>
        </div>
        <div className="flex h-12 items-end gap-1">
          {counts.map((c, i) => (
            <div key={i} className="relative h-full flex-1 bg-[var(--bar0)]">
              <div
                className="absolute inset-x-0 bottom-0 bg-[var(--acc)]"
                style={{ height: `${(c / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  delta,
  first,
}: {
  label: string;
  value: number;
  unit: string;
  delta?: number;
  first?: boolean;
}) {
  return (
    <div className={`p-4 ${first ? "" : "border-l border-[var(--rule2)]"}`}>
      <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--faint)]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-pixel text-[50px] leading-[0.8] tabular-nums text-[var(--fg)]">
          {value}
        </span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-[var(--faint2)]">{unit}</div>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="flex items-center gap-0.5 font-mono text-[12px] font-semibold text-[var(--acc)]">
        <ArrowUp className="size-3" />
        {value}
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-0.5 font-mono text-[12px] font-semibold" style={{ color: WARN }}>
        <ArrowDown className="size-3" />
        {Math.abs(value)}
      </span>
    );
  return <Minus className="size-3 text-[var(--faint2)]" />;
}

// ---- Niveles (gamification, gated on settings.levelsEnabled) ------------------

/** Racha pixel counter + RPG character sheet + achievements row. */
function LevelsPanel({ levels }: { levels: LevelsSummary }) {
  const t = useT();
  const achievements = computeAchievements(levels);

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Racha — big pixel streak counter + overall rank */}
      <div className="flex border border-[var(--rule2)]">
        <div className="flex flex-1 flex-col p-4">
          <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--faint)]">
            {t.levels.streak}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-pixel text-[50px] leading-[0.8] tabular-nums text-[var(--acc)]">
              {levels.streak}
            </span>
            <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--faint2)]">
              {levels.streak === 1 ? t.levels.day : t.levels.days}
            </span>
          </div>
        </div>
        <div className="flex flex-col border-l border-[var(--rule2)] p-4">
          <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--faint)]">
            {t.levels.rank}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-pixel text-[50px] leading-[0.8] tabular-nums text-[var(--fg)]">
              {levels.rank}
            </span>
          </div>
          <div className="mt-1 h-1 w-full bg-[var(--bar0)]">
            <div className="h-full bg-[var(--acc)]" style={{ width: `${levels.rankProgress * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-col border-l border-[var(--rule2)] p-4">
          <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--faint)]">
            {t.levels.totalSets}
          </span>
          <div className="mt-2 flex items-baseline">
            <span className="font-pixel text-[50px] leading-[0.8] tabular-nums text-[var(--fg)]">
              {levels.totalSets}
            </span>
          </div>
        </div>
      </div>

      {/* Character sheet — 6 attributes, each with its LVL + progress bar */}
      <div className="border border-[var(--rule2)] p-4">
        <SectionRule index={1} label={t.levels.sheet} />
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
          {levels.attributes.map((a) => (
            <AttributeBar key={a.group} group={a.group} level={a.level} progress={a.progress} />
          ))}
        </div>
      </div>

      {/* Achievements — derived, currently-earned only */}
      <div className="border border-[var(--rule2)] p-4">
        <SectionRule index={2} label={t.levels.achievements} />
        <div className="mt-3 flex flex-wrap gap-2">
          {achievements.map((a) => (
            <AchievementChip key={a.id} ach={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AttributeBar({ group, level, progress }: { group: BodyGroup; level: number; progress: number }) {
  const t = useT();
  const label = (t.body.regions as Record<BodyGroup, string>)[group];
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[11px] tracking-[0.06em] text-[var(--fg)] uppercase">
            {label}
          </span>
          <span className="flex items-baseline gap-1 font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">
            {t.levels.lvl}
            <span className="font-pixel text-[16px] leading-none tabular-nums text-[var(--acc)]">{level}</span>
          </span>
        </div>
        <div className="h-1.5 w-full bg-[var(--bar0)]">
          <div className="h-full bg-[var(--acc)]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function AchievementChip({ ach }: { ach: Achievement }) {
  const t = useT();
  const label = (t.levels.ach as Record<string, string>)[ach.id] ?? ach.id;
  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.06em]"
      style={{
        borderColor: ach.earned ? "var(--acc)" : "var(--rule2)",
        background: ach.earned ? "var(--acc)" : "transparent",
        color: ach.earned ? "var(--on)" : "var(--faint2)",
      }}
      title={ach.earned ? undefined : t.levels.locked}
    >
      <span
        className="size-1.5"
        style={{ background: ach.earned ? "var(--on)" : "var(--faint2)" }}
      />
      {label}
    </span>
  );
}
