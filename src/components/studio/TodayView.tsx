import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { formatMinute } from "@/lib/engine";
import type { Block, RoutineItem } from "@/lib/engine";
import { exerciseContext } from "@/domain/seed";
import { aggregateState, workedGroupCount } from "@/domain/bodyGroups";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { nowMinutes, useStore } from "@/store/useStore";
import { BodyFigures, BodyLegend } from "./BodyMap";
import { Corners, RegMark } from "./hud";
import { RAIL_BODY_W, RAIL_CLASS, ViewHeader } from "./shell";

const metaLine = (parts: (string | false)[]) => parts.filter(Boolean).join(" · ");

const pad = (n: number) => String(n).padStart(2, "0");
const hh = (min: number) => pad(Math.round(min / 60));
const NEXT_BG = "color-mix(in oklch, var(--acc) 5%, transparent)";
/** Show the quick actions only when the set is due or this many minutes away. */
const ACTION_THRESHOLD_MIN = 5;

export function TodayView() {
  const day = useStore((s) => s.day);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const done = useStore((s) => s.done);
  const decline = useStore((s) => s.decline);
  const snooze = useStore((s) => s.snooze);
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
        {/* LEFT RAIL — today's muscle load (anchored cockpit) */}
        <aside className={RAIL_CLASS}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">{t.today.loadToday}</span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
              <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
              {t.body.live}
            </span>
          </div>
          <div
            className="relative flex justify-center border border-[var(--rule2)] p-4"
            style={{ background: "radial-gradient(ellipse at 50% 32%, color-mix(in oklch, var(--acc) 5%, transparent), transparent 62%)" }}
          >
            <Corners />
            <RegMark className="top-2 left-2.5" />
            <BodyFigures state={aggState} width={RAIL_BODY_W} />
          </div>
          <BodyLegend />
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-pixel text-[30px] leading-[0.8] text-[var(--fg)]">{worked}</span>
            <span className="font-pixel text-[16px] text-[var(--faint2)]">/6</span>
            <span className="ml-auto self-end font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
              {t.body.coverage}
            </span>
          </div>
        </aside>

        {/* RIGHT PANE — next set + the day timeline (scrolls) */}
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          {next ? (
            showActions ? (
              <div className="flex items-center justify-between gap-6 bg-[var(--acc)] px-[26px] py-[22px] text-[var(--on)]">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-semibold tracking-[0.2em]">
                    {isDue ? t.today.now : `${t.today.in} ${eta} ${t.today.min}`} — {formatMinute(next.time)}
                  </div>
                  <div className="mt-2 text-[40px] leading-[0.95] font-extrabold tracking-[-0.04em] uppercase">
                    {name(next.exerciseId)}
                  </div>
                  <div className="mt-2 font-mono text-[12.5px] tracking-[0.04em] opacity-70">{nextMeta}</div>
                </div>
                <div className="flex flex-none flex-col gap-2">
                  <button
                    onClick={() => done(next.id)}
                    className="flex items-center justify-center gap-2 bg-[var(--on)] px-[26px] py-[13px] font-mono text-[13px] font-semibold tracking-[0.08em] text-[var(--acc)]"
                  >
                    <Check className="size-4" strokeWidth={3} /> {t.today.done}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => snooze(next.id, 30)}
                      className="flex-1 border-2 border-[var(--on)] px-4 py-[11px] font-mono text-[11.5px] font-semibold tracking-[0.06em]"
                    >
                      {t.today.snooze}
                    </button>
                    <button
                      onClick={() => decline(next.id)}
                      className="flex-1 border-2 px-4 py-[11px] font-mono text-[11.5px] font-semibold tracking-[0.06em]"
                      style={{ borderColor: "rgba(10,10,10,0.35)" }}
                    >
                      {t.today.notNow}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-between gap-6 border border-[var(--rule2)] px-[26px] py-[22px]"
                style={{ borderLeft: "3px solid var(--acc)" }}
              >
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-semibold tracking-[0.2em] text-[var(--faint)]">
                    {t.today.next} — {formatMinute(next.time)}
                  </div>
                  <div className="mt-2 text-[40px] leading-[0.95] font-extrabold tracking-[-0.04em] text-[var(--fg)] uppercase">
                    {name(next.exerciseId)}
                  </div>
                  <div className="mt-2 font-mono text-[12.5px] tracking-[0.04em] text-[var(--faint)]">{nextMeta}</div>
                </div>
                <div className="flex-none text-right">
                  <div className="font-pixel text-[52px] leading-[0.8] text-[var(--fg)]">{heroNum}</div>
                  <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-[var(--faint)]">
                    {heroIsMin ? t.today.minutes : t.today.hours}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="border border-[var(--rule2)] p-5 font-mono text-[12px] tracking-[0.04em] text-[var(--faint)]">
              {total > 0 ? t.today.outOfHours : t.today.noRoutine}
            </div>
          )}

          <div className="mt-[26px] flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--faint)]">
              {t.today.theDay} — {total} {t.today.sets}
            </span>
          </div>
          <div className="mt-3 h-px bg-[var(--rule2)]" />
          {day.blocks.map((b, i) => (
            <DayRow
              key={b.id}
              block={b}
              idx={i + 1}
              isNext={b.id === next?.id}
              nextDue={showActions}
              name={name(b.exerciseId)}
              muscle={muscleOf(b)}
              reps={repsOf(b)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function DayRow({
  block,
  idx,
  isNext,
  nextDue,
  name,
  muscle,
  reps,
}: {
  block: Block;
  idx: number;
  isNext: boolean;
  nextDue: boolean;
  name: string;
  muscle: string;
  reps: string;
}) {
  const t = useT();
  const isDone = block.status === "done";
  const skip = block.status === "skipped";
  const unsched = block.time < 0;
  let status = t.today.stPending;
  let statusColor = "var(--faint)";
  if (isDone) [status, statusColor] = [t.today.stDone, "var(--faint2)"];
  else if (skip) [status, statusColor] = [t.today.stSkipped, "var(--faint2)"];
  else if (isNext) [status, statusColor] = [nextDue ? t.today.stNow : t.today.stNext, "var(--acc)"];
  else if (unsched) [status, statusColor] = [t.today.stWontFit, "var(--faint2)"];

  return (
    <div
      className="relative flex items-center gap-5 border-b border-[var(--rule)] py-[15px]"
      style={{ paddingLeft: isNext ? "14px" : 0, background: isNext ? NEXT_BG : "transparent" }}
    >
      {isNext && <div className="absolute inset-y-0 left-0 w-1 bg-[var(--acc)]" />}
      <span
        className="w-[26px] flex-none font-mono text-[12px]"
        style={{ color: isNext ? "var(--acc)" : "var(--faint2)" }}
      >
        {pad(idx)}
      </span>
      <span
        className="w-[76px] flex-none font-mono text-[21px] font-medium tracking-[-0.01em]"
        style={{ color: isDone || skip ? "var(--faint2)" : isNext ? "var(--acc)" : "var(--dim)" }}
      >
        {unsched ? "—" : formatMinute(block.time)}
      </span>
      <span
        className="flex-1 truncate text-[21px] font-bold tracking-[-0.02em] uppercase"
        style={{
          color: isDone || skip ? "var(--faint2)" : isNext ? "var(--fg)" : "var(--fg2)",
          textDecoration: skip ? "line-through" : "none",
        }}
      >
        {name}
      </span>
      <span className="w-[74px] flex-none font-mono text-[10.5px] tracking-[0.1em] text-[var(--faint2)]">
        {muscle}
      </span>
      <span
        className="w-[60px] flex-none text-right font-mono text-[14px]"
        style={{ color: isDone || skip ? "var(--faint2)" : "var(--dim)" }}
      >
        {reps}
      </span>
      <span
        className="w-[86px] flex-none text-right font-mono text-[10.5px] font-semibold tracking-[0.1em]"
        style={{ color: statusColor }}
      >
        {status}
      </span>
    </div>
  );
}
