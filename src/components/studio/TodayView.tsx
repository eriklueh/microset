import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { formatMinute } from "@/lib/engine";
import type { Block, RoutineItem } from "@/lib/engine";
import { exerciseContext } from "@/domain/seed";
import { aggregateState, workedGroupCount } from "@/domain/bodyGroups";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { nowMinutes, useStore } from "@/store/useStore";
import { BodyLegend, ModelRail } from "./BodyMap";
import { FeasibilityHint } from "./Feasibility";
import { ViewHeader } from "./shell";

const metaLine = (parts: (string | false)[]) => parts.filter(Boolean).join(" · ");

const pad = (n: number) => String(n).padStart(2, "0");
const hh = (min: number) => pad(Math.round(min / 60));
/** Show the quick actions only when the set is due or this many minutes away. */
const ACTION_THRESHOLD_MIN = 5;

export function TodayView() {
  const day = useStore((s) => s.day);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const done = useStore((s) => s.done);
  const snooze = useStore((s) => s.snooze);
  const skip = useStore((s) => s.skip);
  const snoozeMinutes = useStore((s) => s.snoozeMinutes);
  const { byId, name, variantLabel } = useCatalog();
  const t = useT();
  const [now, setNow] = useState(nowMinutes());

  useEffect(() => {
    const handle = setInterval(() => setNow(nowMinutes()), 20_000);
    return () => clearInterval(handle);
  }, []);

  if (!day) return null;
  const weekday = t.today.weekdays[(new Date().getDay() + 6) % 7];

  if (day.rest) {
    return (
      <div className="flex h-full flex-col">
        <ViewHeader
          kicker={metaLine([weekday, t.today.rest, `${hh(settings.workWindow.start)}–${hh(settings.workWindow.end)}H`])}
          title={t.today.title}
        />
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="border border-[var(--rule2)] p-10 text-center">
            <div className="text-[34px] font-extrabold tracking-[-0.03em] text-[var(--fg)] uppercase">
              {t.today.restTitle}
            </div>
            <div className="mt-2 font-mono text-[11px] tracking-[0.1em] text-[var(--faint)] uppercase">
              {t.today.restSub}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const total = day.blocks.length;
  const doneCount = day.blocks.filter((b) => b.status === "done").length;
  const pct = total ? (doneCount / total) * 100 : 0;
  const next = day.blocks
    .filter((b) => (b.status === "pending" || b.status === "snoozed") && b.time >= 0)
    .sort((a, b) => a.time - b.time)[0];

  const muscleOf = (b: Block) => {
    const ex = byId(b.exerciseId);
    return ex ? t.muscle[ex.muscle].toUpperCase() : "";
  };
  const repsOf = (b: Block) => b.target ?? byId(b.exerciseId)?.defaultReps ?? "";

  // Today's aggregate muscle load — one routine item per exercise, sets = blocks of it.
  const counts: Record<string, number> = {};
  for (const b of day.blocks) counts[b.exerciseId] = (counts[b.exerciseId] ?? 0) + b.sets;
  const todayLoad: RoutineItem[] = Object.entries(counts).map(([exerciseId, sets]) => ({ exerciseId, name: "", sets }));
  const aggState = aggregateState(todayLoad, byId, owned);
  const worked = workedGroupCount(aggState);

  const eta = next ? next.time - now : 0;
  const isDue = eta <= 0;
  const showActions = !!next && eta <= ACTION_THRESHOLD_MIN;
  const heroH = Math.floor(Math.max(eta, 0) / 60);
  const heroM = Math.max(eta, 0) % 60;
  const heroNum = eta < 60 ? String(Math.max(eta, 0)) : `${heroH}:${String(heroM).padStart(2, "0")}`;
  const heroIsMin = eta < 60;
  const nextEx = next ? byId(next.exerciseId) : undefined;
  const nextMeta = next
    ? [
        nextEx && exerciseContext(nextEx) === "desk" ? t.context.desk.toUpperCase() : "",
        `${repsOf(next)} ${t.today.reps}`,
        variantLabel(next.exerciseId, next.variantId).toUpperCase(),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // The day as a relay track: scheduled blocks in time order + the ones that didn't fit.
  const scheduled = day.blocks.filter((b) => b.time >= 0).sort((a, b) => a.time - b.time);
  const unscheduled = day.blocks.filter((b) => b.time < 0);

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker={metaLine([weekday, (day.dayTypeName ?? "").toUpperCase(), `${hh(settings.workWindow.start)}–${hh(settings.workWindow.end)}H`])}
        title={t.today.title}
        right={
          <div className="text-right">
            <div className="font-pixel text-[34px] leading-[0.8] text-[var(--fg)]">
              {pad(doneCount)}
              <span className="text-[var(--faint2)]">/{pad(total)}</span>
            </div>
            <div className="mt-1 font-mono text-[8.5px] tracking-[0.18em] text-[var(--faint)]">{t.today.setsDone}</div>
          </div>
        }
        context={
          <div className="flex h-[4px]">
            <div className="bg-[var(--acc)]" style={{ width: `${pct}%` }} />
            <div className="flex-1 bg-[var(--bar0)]" />
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* LEFT RAIL — today's muscle load (anchored cockpit, shared ModelRail) */}
        <ModelRail
          label={t.today.loadToday}
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
            <span className="font-pixel text-[30px] leading-[0.8] text-[var(--fg)]">{worked}</span>
            <span className="font-pixel text-[16px] text-[var(--faint2)]">/6</span>
            <span className="ml-auto self-end font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
              {t.body.coverage}
            </span>
          </div>
        </ModelRail>

        {/* RIGHT PANE — the day as a relay track (scrolls) */}
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <div className="mb-2 flex items-center gap-3">
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--faint)]">
              {t.today.theDay} · {total} {t.today.sets}
            </span>
            <span className="h-px flex-1 bg-[var(--rule2)]" />
          </div>

          {scheduled.length === 0 ? (
            <div className="mt-2 border border-[var(--rule2)] p-5 font-mono text-[12px] tracking-[0.04em] text-[var(--faint)]">
              {total > 0 ? t.today.outOfHours : t.today.noRoutine}
            </div>
          ) : (
            <div className="relative">
              {scheduled.map((b) => (
                <Fragment key={b.id}>
                  {next && b.id === next.id && <NowMarker label={t.today.now} clock={formatMinute(now)} />}
                  {b.id === next?.id ? (
                    <NextNode
                      block={b}
                      due={isDue}
                      showActions={showActions}
                      eta={eta}
                      heroNum={heroNum}
                      heroIsMin={heroIsMin}
                      name={name(b.exerciseId)}
                      meta={nextMeta}
                      onDone={() => done(b.id)}
                      onLater={() => snooze(b.id, snoozeMinutes)}
                      onSkip={() => skip(b.id)}
                    />
                  ) : (
                    <TrackRow block={b} name={name(b.exerciseId)} muscle={muscleOf(b)} />
                  )}
                </Fragment>
              ))}
            </div>
          )}

          {unscheduled.length > 0 && (
            <>
              <div className="mt-5 mb-1.5 flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--faint2)]">
                  {t.feasibility.wontFit}
                </span>
                <span className="h-px flex-1 bg-[var(--rule2)]" />
              </div>
              <FeasibilityHint className="mb-2" />
              {unscheduled.map((b) => (
                <TrackRow key={b.id} block={b} name={name(b.exerciseId)} muscle={muscleOf(b)} />
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** The vertical spine rail cell that carries each node (and the connecting line). */
function Rail({ node }: { node: ReactNode }) {
  return (
    <div className="relative flex w-9 flex-none justify-center">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--rule2)]" />
      <span className="relative z-[1] mt-[15px]">{node}</span>
    </div>
  );
}

/** The "you are here" relay head — sits on the spine right above the next set. */
function NowMarker({ label, clock }: { label: string; clock: string }) {
  return (
    <div className="relative flex gap-3">
      <div className="relative flex w-9 flex-none justify-center">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--rule2)]" />
        <span
          className="relative z-[1] mt-2 size-2.5 rotate-45 bg-[var(--acc)]"
          style={{ boxShadow: "0 0 7px var(--acc)" }}
        />
      </div>
      <div className="flex flex-1 items-center gap-2 py-1.5">
        <span className="font-mono text-[9.5px] font-bold tracking-[0.2em] text-[var(--acc)]">{label}</span>
        <span className="font-pixel text-[13px] leading-none text-[var(--acc)]">{clock}</span>
        <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, var(--acc), transparent)" }} />
      </div>
    </div>
  );
}

/** A done / skipped / pending block on the track. */
function TrackRow({ block, name, muscle }: { block: Block; name: string; muscle: string }) {
  const t = useT();
  const isDone = block.status === "done";
  const skip = block.status === "skipped";
  const unsched = block.time < 0;
  let status = t.today.stPending;
  let statusColor = "var(--faint)";
  if (isDone) [status, statusColor] = [t.today.stDone, "var(--faint2)"];
  else if (skip) [status, statusColor] = [t.today.stSkipped, "var(--faint2)"];
  else if (unsched) [status, statusColor] = [t.feasibility.wontFit, "var(--faint2)"];

  const node = isDone ? (
    <span className="block size-2.5 bg-[var(--acc)]" />
  ) : skip ? (
    <span className="block size-2.5 border border-[var(--faint2)]" />
  ) : (
    <span className="block size-2.5 border border-[var(--rule2)] bg-[var(--bg)]" />
  );
  const dim = isDone || skip;

  return (
    <div className="relative flex gap-3">
      {unsched ? <div className="w-9 flex-none" /> : <Rail node={node} />}
      <div className="flex flex-1 items-center gap-4 border-b border-[var(--rule)] py-[13px]">
        <span
          className="w-[54px] flex-none font-mono text-[18px] tracking-[-0.01em]"
          style={{ color: dim ? "var(--faint2)" : "var(--dim)" }}
        >
          {unsched ? "—" : formatMinute(block.time)}
        </span>
        <span
          className="flex-1 truncate text-[18px] font-bold tracking-[-0.02em] uppercase"
          style={{ color: dim ? "var(--faint2)" : "var(--fg)", textDecoration: skip ? "line-through" : "none" }}
        >
          {name}
        </span>
        <span className="hidden w-[70px] flex-none font-mono text-[10px] tracking-[0.1em] text-[var(--faint2)] md:block">
          {muscle}
        </span>
        <span
          className="w-[78px] flex-none text-right font-mono text-[10px] font-semibold tracking-[0.1em]"
          style={{ color: statusColor }}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

/** The next set: the relay's live node — countdown when ahead, full actions when due/soon. */
function NextNode({
  block,
  due,
  showActions,
  eta,
  heroNum,
  heroIsMin,
  name,
  meta,
  onDone,
  onLater,
  onSkip,
}: {
  block: Block;
  due: boolean;
  showActions: boolean;
  eta: number;
  heroNum: string;
  heroIsMin: boolean;
  name: string;
  meta: string;
  onDone: () => void;
  onLater: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const node = (
    <span
      className="block size-3 bg-[var(--acc)]"
      style={{ boxShadow: "0 0 0 3px color-mix(in oklch, var(--acc) 22%, transparent)" }}
    />
  );
  return (
    <div className="relative flex gap-3">
      <Rail node={node} />
      <div className="flex-1 py-2">
        <div
          className={showActions ? "bg-[var(--acc)] p-4 text-[var(--on)]" : "border border-[var(--rule2)] p-4"}
          style={showActions ? undefined : { borderLeft: "3px solid var(--acc)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div
                className="font-mono text-[10px] font-semibold tracking-[0.2em]"
                style={{ color: showActions ? "inherit" : "var(--faint)" }}
              >
                {due ? t.today.now : `${t.today.in} ${eta} ${t.today.min}`} — {formatMinute(block.time)}
              </div>
              <div
                className="mt-1.5 truncate text-[30px] leading-[0.95] font-extrabold tracking-[-0.03em] uppercase"
                style={{ color: showActions ? "inherit" : "var(--fg)" }}
              >
                {name}
              </div>
              <div
                className="mt-1.5 font-mono text-[11px] tracking-[0.04em]"
                style={{ color: showActions ? "inherit" : "var(--faint)", opacity: showActions ? 0.7 : 1 }}
              >
                {meta}
              </div>
            </div>
            {!showActions && (
              <div className="flex-none text-right">
                <div className="font-pixel text-[40px] leading-[0.8] text-[var(--fg)]">{heroNum}</div>
                <div className="mt-1 font-mono text-[9px] tracking-[0.18em] text-[var(--faint)]">
                  {heroIsMin ? t.today.minutes : t.today.hours}
                </div>
              </div>
            )}
          </div>
          {showActions && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onDone}
                className="flex flex-1 items-center justify-center gap-2 bg-[var(--on)] py-2.5 font-mono text-[12px] font-semibold tracking-[0.06em] text-[var(--acc)]"
              >
                <Check className="size-4" strokeWidth={3} /> {t.actions.done}
              </button>
              <button
                onClick={onLater}
                className="border-2 border-[var(--on)] px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
              >
                {t.actions.later}
              </button>
              <button
                onClick={onSkip}
                className="border-2 px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
                style={{ borderColor: "color-mix(in oklch, var(--on) 35%, transparent)" }}
              >
                {t.actions.skip}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
