import { useMemo, useState, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { defaultVariantId, isAvailable } from "@/domain/seed";
import type { RoutineItem } from "@/lib/engine";
import {
  adaptMissedSession,
  type AdaptContext,
  type Adaptation,
  type Modality,
  type Session,
  type SessionLocation,
  type SkipReason,
} from "@/modules/entreno/entreno";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { dateKey, useStore } from "@/store/useStore";
import { ViewHeader, CockpitRail, RailStat } from "./shell";
import { SectionRule } from "./hud";

/**
 * ENTRENO — Studio view for the (opt-in) training module. Lets the user build/edit
 * structured or external sessions, assign them to the 7 weekdays, and — the headline —
 * mark a session NOT DONE with a motive and see the smart adaptation the pure planner
 * returns (rest / mobility / a home-calisthenics substitution circuit). Everything is
 * gated behind `modules.entreno.enabled`; with the module off this view never mounts.
 */

const inputCls =
  "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";
const MODALITIES: Modality[] = ["calisthenics", "strength", "sport", "cardio"];
const LOCATIONS: SessionLocation[] = ["home", "away"];
const REASONS: SkipReason[] = ["enfermo", "lesionado", "ocupado", "viajando"];

/** Canonical `YYYY-M-D` key for today (matches the store's outcome records). */
function todayKey(): string {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export function EntrenoView() {
  const t = useT();
  const sessions = useStore((s) => s.entreno.sessions);
  const week = useStore((s) => s.entreno.week);
  const setEntrenoWeekDay = useStore((s) => s.setEntrenoWeekDay);
  const addEntrenoSession = useStore((s) => s.addEntrenoSession);
  const assigned = week.filter(Boolean).length;

  const sessionTitle = (s: Session) =>
    `${t.entreno.modalities[s.modality]} · ${t.entreno.locations[s.location]}`.toUpperCase();

  const newBtn =
    "border border-[var(--rule2)] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]";

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker={t.entreno.sub}
        title={t.entreno.title}
        right={
          <>
            <button
              onClick={() => addEntrenoSession({ modality: "calisthenics", location: "home", external: false })}
              className={newBtn}
            >
              {t.entreno.newStructured}
            </button>
            <button
              onClick={() => addEntrenoSession({ modality: "sport", location: "away", external: true })}
              className={newBtn}
            >
              {t.entreno.newExternal}
            </button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <CockpitRail label={t.entreno.railLabel}>
          <RailStat value={sessions.length} unit={t.entreno.railSessions} />
          <div className="mt-4 border-t border-[var(--rule)] pt-3">
            <RailStat value={`${assigned}/7`} unit={t.entreno.railAssigned} />
          </div>
        </CockpitRail>

        <section className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          {/* Week assignment strip */}
          <SectionRule index={1} label={t.entreno.weekTitle} right={t.entreno.weekHint} />
          <div className="mt-3 flex border border-[var(--rule2)]">
            {t.routine.dow.map((d, i) => (
              <div key={i} className="min-w-0 flex-1 border-r border-[var(--rule)] p-2 last:border-r-0">
                <div className="mb-1 font-mono text-[9.5px] tracking-[0.14em] text-[var(--faint)]">{d}</div>
                <select
                  value={week[i] ?? ""}
                  onChange={(e) => setEntrenoWeekDay(i, e.currentTarget.value || null)}
                  aria-label={`${t.entreno.weekTitle} ${d}`}
                  className={`${inputCls} w-full appearance-none px-1.5 py-1 font-mono text-[10px]`}
                  style={{ color: week[i] ? "var(--fg)" : "var(--faint2)" }}
                >
                  <option value="" className="bg-[var(--ink2)]">
                    {t.entreno.none}
                  </option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[var(--ink2)]">
                      {sessionTitle(s)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Sessions */}
          <div className="mt-7">
            <SectionRule index={2} label={t.entreno.sessionsTitle} right={String(sessions.length)} />
          </div>
          <div className="mt-3 flex flex-col gap-4">
            {sessions.length === 0 ? (
              <p className="border border-[var(--rule2)] p-6 text-center text-[13px] text-[var(--faint)]">
                {t.entreno.noSessions}
              </p>
            ) : (
              sessions.map((s) => <SessionCard key={s.id} session={s} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: Session }) {
  const t = useT();
  const { all, byId, name } = useCatalog();
  const owned = useStore((s) => s.ownedEquipment);
  const records = useStore((s) => s.entreno.records);
  const updateEntrenoSession = useStore((s) => s.updateEntrenoSession);
  const removeEntrenoSession = useStore((s) => s.removeEntrenoSession);
  const addEntrenoItem = useStore((s) => s.addEntrenoItem);
  const removeEntrenoItem = useStore((s) => s.removeEntrenoItem);
  const logEntrenoSession = useStore((s) => s.logEntrenoSession);
  const skipEntrenoSession = useStore((s) => s.skipEntrenoSession);

  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [result, setResult] = useState<{ reason: SkipReason; adapt: Adaptation } | null>(null);

  // Small injected planner context (never from the store): catalog + owned equipment.
  const ctx: AdaptContext = useMemo(() => ({ byId, catalog: all, owned }), [byId, all, owned]);

  const todayK = todayKey();
  const todayRec = [...records].reverse().find((r) => r.sessionId === session.id && r.date === todayK);

  const onReason = (reason: SkipReason) => {
    skipEntrenoSession(session.id, reason);
    setResult({ reason, adapt: adaptMissedSession(session, reason, ctx) });
    setReasonsOpen(false);
  };

  const addItem = (exerciseId: string) => {
    const ex = byId(exerciseId);
    if (!ex) return;
    const item: RoutineItem = {
      exerciseId: ex.id,
      name: ex.name,
      sets: ex.defaultSets,
      target: ex.defaultReps,
      variantId: defaultVariantId(ex),
    };
    addEntrenoItem(session.id, item);
  };

  const title = `${t.entreno.modalities[session.modality]} · ${t.entreno.locations[session.location]}`.toUpperCase();
  const availableToAdd = session.external
    ? []
    : all.filter((e) => isAvailable(e, owned) && !session.items.some((it) => it.exerciseId === e.id));

  return (
    <div className="border border-[var(--rule2)] p-4">
      {/* header: title + kind + today outcome + delete */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-bold tracking-[-0.02em] text-[var(--fg)] uppercase">
            {title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="border border-[var(--rule2)] px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] text-[var(--faint)]">
              {session.external ? t.entreno.external : t.entreno.structured}
            </span>
            {todayRec && (
              <span
                className="font-mono text-[9px] tracking-[0.12em]"
                style={{ color: todayRec.status === "done" ? "var(--acc)" : "var(--faint2)" }}
              >
                {todayRec.status === "done"
                  ? t.entreno.status.done
                  : `${t.entreno.status.skipped} · ${t.entreno.reasons[todayRec.reason ?? "ocupado"]}`}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => removeEntrenoSession(session.id)}
          aria-label={t.entreno.delete}
          className="flex-none text-[var(--faint2)] hover:text-[var(--destructive)]"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* edit: modality + location (+ external params) */}
      <div className="mt-3 flex flex-wrap gap-4">
        <Labeled label={t.entreno.modality}>
          <select
            value={session.modality}
            onChange={(e) => updateEntrenoSession(session.id, { modality: e.currentTarget.value as Modality })}
            aria-label={t.entreno.modality}
            className={`${inputCls} appearance-none px-2 py-1 font-mono text-[11px]`}
          >
            {MODALITIES.map((m) => (
              <option key={m} value={m} className="bg-[var(--ink2)]">
                {t.entreno.modalities[m]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label={t.entreno.location}>
          <select
            value={session.location}
            onChange={(e) => updateEntrenoSession(session.id, { location: e.currentTarget.value as SessionLocation })}
            aria-label={t.entreno.location}
            className={`${inputCls} appearance-none px-2 py-1 font-mono text-[11px]`}
          >
            {LOCATIONS.map((l) => (
              <option key={l} value={l} className="bg-[var(--ink2)]">
                {t.entreno.locations[l]}
              </option>
            ))}
          </select>
        </Labeled>
        {session.external && (
          <>
            <Labeled label={t.entreno.duration}>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={600}
                  step={5}
                  value={session.durationMin}
                  onChange={(e) => updateEntrenoSession(session.id, { durationMin: Number(e.currentTarget.value) })}
                  aria-label={t.entreno.duration}
                  className={`${inputCls} w-16 px-2 py-1 text-center font-mono text-[11px]`}
                />
                <span className="font-mono text-[9px] text-[var(--faint2)]">{t.entreno.min}</span>
              </span>
            </Labeled>
            <Labeled label={t.entreno.intensity}>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(session.intensity * 100)}
                  onChange={(e) => updateEntrenoSession(session.id, { intensity: Number(e.currentTarget.value) / 100 })}
                  aria-label={t.entreno.intensity}
                  className={`${inputCls} w-16 px-2 py-1 text-center font-mono text-[11px]`}
                />
                <span className="font-mono text-[9px] text-[var(--faint2)]">%</span>
              </span>
            </Labeled>
          </>
        )}
      </div>

      {/* structured: exercise list from the shared catalog */}
      {!session.external && (
        <div className="mt-4 border-t border-[var(--rule)] pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] tracking-[0.16em] text-[var(--faint)]">
              {t.entreno.exercises} · {session.items.length}
            </span>
            {availableToAdd.length > 0 && (
              <select
                value=""
                onChange={(e) => e.currentTarget.value && addItem(e.currentTarget.value)}
                aria-label={t.entreno.addExercise}
                className={`${inputCls} appearance-none px-2 py-1 font-mono text-[10px]`}
              >
                <option value="" className="bg-[var(--ink2)]">
                  {t.entreno.addExercise}
                </option>
                {availableToAdd.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[var(--ink2)]">
                    {name(e.id).toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>
          {session.items.length === 0 ? (
            <p className="py-2 text-center font-mono text-[10px] text-[var(--faint2)]">{t.entreno.noItems}</p>
          ) : (
            <div className="flex flex-col">
              {session.items.map((it) => (
                <div
                  key={it.exerciseId}
                  className="flex items-center justify-between gap-2 border-b border-[var(--rule)] py-1.5 last:border-b-0"
                >
                  <span className="truncate text-[13px] font-semibold text-[var(--fg)]">{name(it.exerciseId)}</span>
                  <div className="flex flex-none items-center gap-2.5">
                    <span className="font-mono text-[10px] text-[var(--faint)]">
                      {it.sets}×{it.target ? ` ${it.target}` : ""}
                    </span>
                    <button
                      onClick={() => removeEntrenoItem(session.id, it.exerciseId)}
                      aria-label={t.entreno.removeItem}
                      className="text-[var(--faint2)] hover:text-[var(--destructive)]"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* outcomes: log done / mark not done → motive → adaptation */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--rule)] pt-3">
        <button
          onClick={() => logEntrenoSession(session.id)}
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
            {REASONS.map((r) => (
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

      {result && <AdaptationPanel adapt={result.adapt} />}
    </div>
  );
}

function AdaptationPanel({ adapt }: { adapt: Adaptation }) {
  const t = useT();
  const { name } = useCatalog();
  const kindLabel =
    adapt.kind === "rest"
      ? t.entreno.adaptKindRest
      : adapt.kind === "mobility"
        ? t.entreno.adaptKindMobility
        : t.entreno.adaptKindSubstitute;

  return (
    <div
      className="mt-3 border-l-2 border-[var(--acc)] p-3"
      style={{ background: "color-mix(in oklch, var(--acc) 6%, transparent)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[var(--acc)]">{t.entreno.adaptTitle}</span>
        <span className="border border-[var(--acc)] px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-[var(--acc)]">
          {kindLabel}
        </span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">
          {adapt.addsLoad ? t.entreno.addsLoad : t.entreno.noLoad}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--dim)]">{adapt.note}</p>
      {adapt.skillDropped && (
        <div className="mt-1 font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">{t.entreno.skillDropped}</div>
      )}
      {adapt.circuit.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[9px] tracking-[0.16em] text-[var(--faint)]">{t.entreno.circuit}</div>
          <div className="flex flex-col">
            {adapt.circuit.map((it) => (
              <div
                key={it.exerciseId}
                className="flex items-center justify-between gap-2 border-b border-[var(--rule)] py-1.5 last:border-b-0"
              >
                <span className="truncate text-[13px] font-semibold text-[var(--fg)]">{name(it.exerciseId)}</span>
                <span className="font-mono text-[10px] text-[var(--faint)]">{it.sets}×</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        adapt.kind === "substitute" && (
          <div className="mt-2 font-mono text-[10px] text-[var(--faint2)]">{t.entreno.emptyCircuit}</div>
        )
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)]">{label}</span>
      {children}
    </div>
  );
}
