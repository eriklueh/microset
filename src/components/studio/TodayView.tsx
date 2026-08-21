import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { formatMinute } from "@/lib/engine";
import type { Block, RoutineItem } from "@/lib/engine";
import type { MuscleGroup } from "@/domain/types";
import { exerciseContext } from "@/domain/seed";
import { aggregateState, workedGroupCount } from "@/domain/bodyGroups";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { dateKey, nowMinutes, useStore } from "@/store/useStore";
import {
  adaptMissedSession,
  type AdaptContext,
  type Session,
  type SkipReason,
} from "@/modules/entreno/entreno";
import { BodyLegend, ModelRail } from "./BodyMap";
import { FeasibilityHint } from "./Feasibility";
import { AdaptationPanel } from "./SessionLibrary";
import { ViewHeader } from "./shell";
import { Barcode, Corners, RegMark, SectionRule } from "./hud";

const metaLine = (parts: (string | false)[]) => parts.filter(Boolean).join(" · ");

const pad = (n: number) => String(n).padStart(2, "0");
const hh = (min: number) => pad(Math.round(min / 60));
/** Show the quick actions only when the set is due or this many minutes away. */
const ACTION_THRESHOLD_MIN = 5;

const SKIP_REASONS: SkipReason[] = ["enfermo", "lesionado", "ocupado", "viajando"];

/** Canonical `YYYY-M-D` key for today (matches the Entreno outcome records). */
function todayKey(): string {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Today's ENTRENO session as a block on Hoy's day view: title (modality · location), its
 * window time if set, an "outing" tag when away, the day's outcome, and the two canonical
 * actions — mark DONE (logEntrenoSession) or NOT DONE with a motive (skipEntrenoSession),
 * which surfaces the motive-aware adaptation from the pure planner (rest / mobility / a home
 * substitution circuit). Rendered only when the module is on and a session is assigned today.
 */
function EntrenoDayBlock({ session }: { session: Session }) {
  const t = useT();
  const { all, byId } = useCatalog();
  const owned = useStore((s) => s.ownedEquipment);
  const records = useStore((s) => s.entreno.records);
  const logEntrenoSession = useStore((s) => s.logEntrenoSession);
  const skipEntrenoSession = useStore((s) => s.skipEntrenoSession);

  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [picked, setPicked] = useState<SkipReason | null>(null);

  // Small injected planner context (never from the store): catalog + owned equipment.
  const ctx: AdaptContext = useMemo(() => ({ byId, catalog: all, owned }), [byId, all, owned]);

  const todayK = todayKey();
  const todayRec = [...records].reverse().find((r) => r.sessionId === session.id && r.date === todayK);
  const isDone = todayRec?.status === "done";
  // Reason in effect: the one just picked this session, else a persisted skip for today.
  const reason = picked ?? (todayRec?.status === "skipped" ? (todayRec.reason ?? null) : null);
  const adapt = reason && !isDone ? adaptMissedSession(session, reason, ctx) : null;

  const onReason = (r: SkipReason) => {
    skipEntrenoSession(session.id, r);
    setPicked(r);
    setReasonsOpen(false);
  };
  const onDone = () => {
    logEntrenoSession(session.id);
    setPicked(null);
    setReasonsOpen(false);
  };

  const title =
    session.name?.trim().toUpperCase() ||
    metaLine([t.entreno.modalities[session.modality], t.entreno.locations[session.location]]).toUpperCase();
  const win = session.window;

  return (
    <div className="mb-4 border border-[var(--rule2)] p-4" style={{ borderLeft: "3px solid var(--acc)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold tracking-[0.2em] text-[var(--faint)]">
            {t.today.entrenoSession}
          </div>
          <div className="mt-1.5 truncate text-[26px] leading-[0.95] font-extrabold tracking-[-0.03em] text-[var(--fg)] uppercase">
            {title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.1em]">
            <span className="text-[var(--faint2)]">
              {session.external ? t.entreno.external : t.entreno.structured}
            </span>
            {session.location === "away" && (
              <span className="border border-[var(--rule2)] px-1.5 py-0.5 text-[var(--faint)]">
                {t.entreno.outing}
              </span>
            )}
            {isDone && <span className="text-[var(--acc)]">{t.entreno.status.done}</span>}
            {reason && !isDone && (
              <span className="text-[var(--faint2)]">
                {t.entreno.status.skipped} · {t.entreno.reasons[reason]}
              </span>
            )}
          </div>
        </div>
        {win && (
          <div className="flex-none text-right">
            <div className="font-pixel text-[30px] leading-[0.8] tabular-nums text-[var(--fg)]">
              {formatMinute(win.start)}
            </div>
            <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-[var(--faint2)]">
              → {formatMinute(win.end)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onDone}
          className="bg-[var(--acc)] px-3.5 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--on)]"
        >
          {t.entreno.markDone}
        </button>
        <button
          onClick={() => setReasonsOpen((v) => !v)}
          aria-expanded={reasonsOpen}
          className="border border-[var(--rule2)] px-3.5 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
        >
          {t.entreno.markMissed}
        </button>
      </div>

      {reasonsOpen && (
        <div className="mt-3">
          <div className="mb-2 font-mono text-[9px] tracking-[0.16em] text-[var(--faint)]">
            {t.entreno.reasonTitle}
          </div>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => onReason(r)}
                className="border border-[var(--rule2)] px-3 py-1.5 font-mono text-[11px] tracking-[0.04em] text-[var(--dim)] hover:border-[var(--acc)] hover:text-[var(--acc)]"
              >
                {t.entreno.reasons[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      {adapt && <AdaptationPanel adapt={adapt} />}
    </div>
  );
}

export function TodayView() {
  const day = useStore((s) => s.day);
  const settings = useStore((s) => s.settings);
  const owned = useStore((s) => s.ownedEquipment);
  const done = useStore((s) => s.done);
  const snooze = useStore((s) => s.snooze);
  const skip = useStore((s) => s.skip);
  const snoozeMinutes = useStore((s) => s.snoozeMinutes);
  const logFreeSet = useStore((s) => s.logFreeSet);
  // ENTRENO (opt-in module): surface the day's assigned session as a block on Hoy. With the
  // module off, `entrenoOn` is false → nothing below renders and Hoy is byte-for-byte today's.
  const entrenoOn = useStore((s) => !!s.modules.entreno?.enabled);
  const entrenoSessions = useStore((s) => s.entreno.sessions);
  const entrenoWeek = useStore((s) => s.entreno.week);
  const { all, byId, name, variantLabel } = useCatalog();
  const t = useT();
  const [now, setNow] = useState(nowMinutes());
  const [logOpen, setLogOpen] = useState(false);
  const [stamp, setStamp] = useState<string | null>(null);

  const onLogFree = (exerciseId: string, variantId?: string) => {
    logFreeSet(exerciseId, variantId);
    setLogOpen(false);
    setStamp(`${name(exerciseId)} · ${t.today.logged}`);
    window.setTimeout(() => setStamp(null), 2200);
  };

  useEffect(() => {
    const handle = setInterval(() => setNow(nowMinutes()), 20_000);
    return () => clearInterval(handle);
  }, []);

  if (!day) return null;
  const weekdayIdx = (new Date().getDay() + 6) % 7; // Mon-first, aligned with entreno.week
  const weekday = t.today.weekdays[weekdayIdx];
  // Today's Entreno session (if the module is on and a session is assigned to this weekday).
  const entrenoSession = entrenoOn
    ? entrenoSessions.find((s) => s.id === entrenoWeek[weekdayIdx])
    : undefined;

  if (day.rest) {
    return (
      <div className="flex h-full flex-col">
        <ViewHeader
          kicker={metaLine([weekday, t.today.rest, `${hh(settings.workWindow.start)}–${hh(settings.workWindow.end)}H`])}
          title={t.today.title}
        />
        <div
          className={
            entrenoSession
              ? "flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-8"
              : "flex min-h-0 flex-1 items-center justify-center p-8"
          }
        >
          <div className="relative w-full max-w-[560px] border border-[var(--rule2)] p-10">
            <Corners />
            <RegMark className="top-3 left-1/2 -translate-x-1/2" />
            <RegMark className="bottom-3 left-1/2 -translate-x-1/2" />

            <div className="flex items-center gap-2.5">
              <span className="inline-block size-1.5 bg-[var(--faint2)]" />
              <span className="font-mono text-[10px] font-semibold tracking-[0.22em] text-[var(--faint)]">
                {t.today.restStatus}
              </span>
              <span className="ml-auto">
                <Barcode color="var(--faint2)" height={10} />
              </span>
            </div>

            <div className="mt-6 font-pixel text-[44px] leading-[0.82] tracking-[0.02em] text-[var(--fg)]">
              {t.today.restScreen}
            </div>
            <div className="mt-2.5 font-mono text-[11px] tracking-[0.1em] text-[var(--faint)] uppercase">
              {t.today.restSub}
            </div>

            <div className="mt-8">
              <SectionRule index={1} label={t.today.restProtocol} />
              <div className="mt-3 text-[14px] leading-[1.6] text-[var(--dim)]">
                {t.today.restProtocolBody}
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                {[t.today.restTip1, t.today.restTip2].map((tip) => (
                  <div key={tip} className="flex items-center gap-2.5">
                    <span className="inline-block size-1.5 bg-[var(--acc)]" />
                    <span className="font-mono text-[11px] tracking-[0.04em] text-[var(--faint)] uppercase">
                      {tip}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-end justify-between border-t border-[var(--rule)] pt-4">
              <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--faint2)]">
                {t.today.restNext}
              </span>
              <span className="font-pixel text-[18px] leading-none text-[var(--dim)]">
                {t.today.restNextValue}
              </span>
            </div>
          </div>
          {entrenoSession && (
            <div className="w-full max-w-[560px]">
              <EntrenoDayBlock session={entrenoSession} />
            </div>
          )}
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
            <div className="font-pixel text-[34px] leading-[0.8] tabular-nums text-[var(--fg)]">
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
            <span className="font-pixel text-[30px] leading-[0.8] tabular-nums text-[var(--fg)]">{worked}</span>
            <span className="font-pixel text-[16px] tabular-nums text-[var(--faint2)]">/6</span>
            <span className="ml-auto self-end font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
              {t.body.coverage}
            </span>
          </div>
        </ModelRail>

        {/* RIGHT PANE — the day as a relay track (scrolls) */}
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          {entrenoSession && <EntrenoDayBlock session={entrenoSession} />}
          <div className="mb-2 flex items-center gap-3">
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--faint)]">
              {t.today.theDay} · {total} {t.today.sets}
            </span>
            <span className="h-px flex-1 bg-[var(--rule2)]" />
            {stamp ? (
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-[var(--acc)]">
                <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
                {stamp}
              </span>
            ) : (
              <button
                onClick={() => setLogOpen((v) => !v)}
                className="border border-[var(--rule2)] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
              >
                {t.today.logFree}
              </button>
            )}
          </div>

          {logOpen && (
            <FreeLogPanel
              exercises={all}
              name={name}
              variantLabel={variantLabel}
              onCancel={() => setLogOpen(false)}
              onConfirm={onLogFree}
            />
          )}

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
        <span className="font-pixel text-[13px] leading-none tabular-nums text-[var(--acc)]">{clock}</span>
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
          className="w-[54px] flex-none font-pixel text-[16px] tabular-nums tracking-[0.01em]"
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
                <div className="font-pixel text-[40px] leading-[0.8] tabular-nums text-[var(--fg)]">{heroNum}</div>
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

/** Quick free-set logger: pick an exercise (grouped by muscle) + a variant, then log it.
 *  Appends a LogEntry without touching the day plan — feeds progression/balance only. */
function FreeLogPanel({
  exercises,
  name,
  variantLabel,
  onCancel,
  onConfirm,
}: {
  exercises: { id: string; muscle: MuscleGroup; axis: { id: string }[] }[];
  name: (id: string) => string;
  variantLabel: (exerciseId: string, variantId?: string) => string;
  onCancel: () => void;
  onConfirm: (exerciseId: string, variantId?: string) => void;
}) {
  const t = useT();
  const [exId, setExId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | undefined>(undefined);

  // Group by coarse muscle for a scannable picker, names localized via the catalog.
  const groups = useMemo(() => {
    const order: MuscleGroup[] = ["pull", "push", "core", "legs"];
    const byMuscle = new Map<MuscleGroup, { id: string }[]>();
    for (const e of exercises) {
      const arr = byMuscle.get(e.muscle) ?? [];
      arr.push(e);
      byMuscle.set(e.muscle, arr);
    }
    return order
      .filter((m) => byMuscle.has(m))
      .map((m) => ({ muscle: m, items: byMuscle.get(m)! }));
  }, [exercises]);

  const selected = exId ? exercises.find((e) => e.id === exId) : undefined;

  const pick = (id: string) => {
    setExId(id);
    setVariantId(undefined); // default → bodyweight in variantLabel
  };

  return (
    <div className="mb-3 border border-[var(--rule2)] p-3" style={{ borderLeft: "3px solid var(--acc)" }}>
      <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
        {t.today.logFreeTitle}
      </span>

      <div className="mt-2 font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)]">{t.today.logPick}</div>
      <div className="mt-1.5 max-h-44 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.muscle} className="mb-2">
            <div className="mb-1 font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)]">
              {t.muscle[g.muscle].toUpperCase()}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((e) => {
                const on = e.id === exId;
                return (
                  <button
                    key={e.id}
                    onClick={() => pick(e.id)}
                    className="border px-2 py-1 font-mono text-[10px] tracking-[0.04em]"
                    style={{
                      borderColor: on ? "var(--acc)" : "var(--rule2)",
                      background: on ? "var(--acc)" : "transparent",
                      color: on ? "var(--on)" : "var(--dim)",
                    }}
                  >
                    {name(e.id).toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && selected.axis.length > 1 && (
        <>
          <div className="mt-1 font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)]">{t.today.logVariant}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selected.axis.map((v) => {
              const on = v.id === variantId;
              return (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className="border px-2 py-1 font-mono text-[10px] tracking-[0.04em]"
                  style={{
                    borderColor: on ? "var(--acc)" : "var(--rule2)",
                    background: on ? "var(--acc)" : "transparent",
                    color: on ? "var(--on)" : "var(--dim)",
                  }}
                >
                  {variantLabel(selected.id, v.id).toUpperCase()}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => exId && onConfirm(exId, variantId)}
          disabled={!exId}
          className="flex-1 bg-[var(--acc)] py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--on)] disabled:opacity-40"
        >
          {t.today.logConfirm}
        </button>
        <button
          onClick={onCancel}
          className="border border-[var(--rule2)] px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
        >
          {t.today.logCancel}
        </button>
      </div>
    </div>
  );
}
