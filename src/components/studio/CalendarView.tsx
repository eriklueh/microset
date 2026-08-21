import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  adaptMissedSession,
  type AdaptContext,
  type Session,
  type SkipReason,
} from "@/modules/entreno/entreno";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { REST, dateKey, effectiveKind, effectiveSlot, useStore } from "@/store/useStore";
import { AdaptationPanel } from "./SessionLibrary";
import { ViewHeader } from "./shell";

/**
 * CALENDARIO — the agenda surface (VISION §7 "Modelo de superficies"). This is where you
 * SEE what's on each day and ASSIGN / MARK it — distinct from Rutina (design) and Hoy
 * (live execution). It composes only the ENABLED modules per day: Pausa's day-type +
 * home/office always; the Entreno outing (sport/session) when the module is on. Built to
 * let Nutrición add its own row tomorrow, but nothing about Nutrición is wired now.
 *
 * INCREMENTO 1 is additive: this view duplicates the assignment logic (week strip + month
 * override grid) that today still lives in Rutina — Rutina is not touched yet (that's
 * incremento 2). Reuses the Manifiesto chrome + the exact week-strip / month-grid patterns.
 */

const input =
  "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";
const REASONS: SkipReason[] = ["enfermo", "lesionado", "ocupado", "viajando"];

export function CalendarView() {
  const t = useT();
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const dayKind = useStore((s) => s.dayKind);
  const setWeekDay = useStore((s) => s.setWeekDay);
  const setDayKind = useStore((s) => s.setDayKind);
  const dayOverrides = useStore((s) => s.dayOverrides);
  const setDayOverride = useStore((s) => s.setDayOverride);
  const clearDayOverride = useStore((s) => s.clearDayOverride);
  // ENTRENO (opt-in module): the outing row of the agenda. Off → the calendar shows only
  // Pausa's day-type + place, exactly like a single-module install.
  const entrenoOn = useStore((s) => !!s.modules.entreno?.enabled);
  const entrenoSessions = useStore((s) => s.entreno.sessions);
  const entrenoWeek = useStore((s) => s.entreno.week);
  const setEntrenoWeekDay = useStore((s) => s.setEntrenoWeekDay);
  const records = useStore((s) => s.entreno.records);
  const logEntrenoSession = useStore((s) => s.logEntrenoSession);
  const skipEntrenoSession = useStore((s) => s.skipEntrenoSession);
  const owned = useStore((s) => s.ownedEquipment);

  const { all, byId } = useCatalog();

  const [view, setView] = useState<"semana" | "mes">("semana");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m0: d.getMonth() };
  });
  const [selDate, setSelDate] = useState<string | null>(null); // month-view selected date
  const [weekSel, setWeekSel] = useState<number | null>(null); // week-view selected weekday
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [picked, setPicked] = useState<{ idx: number; reason: SkipReason } | null>(null);

  // Injected planner context (never from the store): catalog + owned equipment.
  const ctx: AdaptContext = useMemo(() => ({ byId, catalog: all, owned }), [byId, all, owned]);

  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const todayK = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  // Actual dates for the current (Mon-first) week — so each column can carry its real date.
  const monOffset = todayIdx;
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - monOffset + i),
  );
  const keyOf = (d: Date) => dateKey(d.getFullYear(), d.getMonth(), d.getDate());

  const months = t.cal.months as string[];
  const prevMonth = () => setCalMonth((c) => (c.m0 === 0 ? { y: c.y - 1, m0: 11 } : { y: c.y, m0: c.m0 - 1 }));
  const nextMonth = () => setCalMonth((c) => (c.m0 === 11 ? { y: c.y + 1, m0: 0 } : { y: c.y, m0: c.m0 + 1 }));

  const sessionTitle = (s: Session) =>
    s.name?.trim().toUpperCase() ||
    `${t.entreno.modalities[s.modality]} · ${t.entreno.locations[s.location]}`.toUpperCase();
  // Minutes-of-day → "HH:MM" for a session's window start (shown where it helps).
  const startTime = (s: Session) =>
    s.window ? `${String(Math.floor(s.window.start / 60)).padStart(2, "0")}:${String(s.window.start % 60).padStart(2, "0")}` : null;

  const cyclePlace = (i: number, place: "home" | "office" | null) =>
    setDayKind(i, place === null ? "home" : place === "home" ? "office" : null);

  // Latest Entreno record for a session on a given date key (matches the store's outcomes).
  const recFor = (sessionId: string, key: string) =>
    [...records].reverse().find((r) => r.sessionId === sessionId && r.date === key);

  const selectDay = (i: number) => {
    setWeekSel(i);
    setReasonsOpen(false);
  };

  // ── SEMANA — 7 columns lun→dom: assign day-type + place (+ outing), mark today ────────
  const weekStrip = (
    <div className="flex flex-none border-b border-[var(--rule2)]">
      {t.routine.dow.map((d, i) => {
        const isToday = i === todayIdx;
        const isSel = i === weekSel;
        const slot = week[i];
        const isRest = slot === REST;
        const place = dayKind[i];
        const outingId = entrenoOn ? entrenoWeek[i] : null;
        const rec = outingId ? recFor(outingId, keyOf(weekDates[i])) : undefined;
        return (
          <div
            key={i}
            className="relative min-w-0 flex-1 border-r border-[var(--rule)] p-2 last:border-r-0"
            style={{
              background: isSel
                ? "color-mix(in oklch, var(--acc) 9%, transparent)"
                : isToday
                  ? "color-mix(in oklch, var(--acc) 5%, transparent)"
                  : "transparent",
            }}
          >
            {isToday && <span className="absolute inset-x-0 top-0 h-0.5 bg-[var(--acc)]" />}
            <div className="flex items-center justify-between gap-1">
              <span
                className="min-w-0 flex-1 truncate font-mono text-[9.5px] tracking-[0.14em]"
                style={{ color: isToday ? "var(--acc)" : "var(--faint)" }}
              >
                {d} {weekDates[i].getDate()}
                {isToday ? " ·" : ""}
              </span>
              <button
                onClick={() => cyclePlace(i, place)}
                aria-label={`${t.week.place} ${d}`}
                title={place === "home" ? t.week.home : place === "office" ? t.week.office : t.week.place}
                className="grid size-4 flex-none place-items-center font-mono text-[9px] font-semibold hover:text-[var(--fg)]"
                style={{ color: place ? "var(--acc)" : "var(--faint2)" }}
              >
                {place ? (place === "home" ? t.week.home : t.week.office).charAt(0).toUpperCase() : "·"}
              </button>
            </div>
            {/* Pausa day-type (the series). Its status stays informative (the assigned name). */}
            <select
              value={slot}
              onChange={(e) => setWeekDay(i, e.currentTarget.value)}
              aria-label={`${t.week.day} ${d}`}
              className={`${input} mt-1 w-full appearance-none px-1.5 py-1 font-mono text-[10.5px]`}
              style={{ color: isRest ? "var(--faint2)" : "var(--fg)" }}
            >
              {dayTypes.map((x) => (
                <option key={x.id} value={x.id} className="bg-[var(--ink2)]">
                  {x.name.toUpperCase()}
                </option>
              ))}
              <option value={REST} className="bg-[var(--ink2)]">
                {t.today.rest.toUpperCase()}
              </option>
            </select>
            {/* Entreno outing (a day can be casa/day-type + salida). Off → this never renders. */}
            {entrenoOn && (
              <>
                <select
                  value={outingId ?? ""}
                  onChange={(e) => setEntrenoWeekDay(i, e.currentTarget.value || null)}
                  aria-label={`${t.entreno.outing} ${d}`}
                  title={t.entreno.outing}
                  className={`${input} mt-1 w-full appearance-none px-1.5 py-1 font-mono text-[10.5px]`}
                  style={{ color: outingId ? "var(--acc)" : "var(--faint2)" }}
                >
                  <option value="" className="bg-[var(--ink2)]">
                    {t.entreno.none}
                  </option>
                  {entrenoSessions.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[var(--ink2)]">
                      {sessionTitle(s)}
                    </option>
                  ))}
                </select>
                {/* Per-day outing status — click to open its actions in the detail panel. */}
                {outingId && (
                  <button
                    onClick={() => selectDay(i)}
                    className="mt-1 flex w-full items-center justify-between gap-1 border px-1.5 py-1 font-mono text-[9px] tracking-[0.08em]"
                    style={{
                      borderColor: isSel ? "var(--acc)" : "var(--rule2)",
                      color: rec?.status === "done" ? "var(--acc)" : "var(--faint2)",
                    }}
                  >
                    <span className="truncate">
                      {rec?.status === "done"
                        ? t.entreno.status.done
                        : rec?.status === "skipped"
                          ? t.entreno.status.skipped
                          : t.calendar.pending}
                    </span>
                    <span className="flex-none" style={{ color: isSel ? "var(--acc)" : "var(--faint2)" }}>
                      ▸
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── SEMANA — selected-day detail: mark HECHO / NO HECHO + motive → adaptation ─────────
  const selSession =
    weekSel != null && entrenoOn
      ? entrenoSessions.find((s) => s.id === entrenoWeek[weekSel])
      : undefined;
  const selIsToday = weekSel === todayIdx;
  const selKey = weekSel != null ? keyOf(weekDates[weekSel]) : null;
  const selRec = selSession && selKey ? recFor(selSession.id, selKey) : undefined;
  const selDone = selRec?.status === "done";
  const selReason: SkipReason | null =
    picked && picked.idx === weekSel
      ? picked.reason
      : selRec?.status === "skipped"
        ? selRec.reason ?? null
        : null;
  const selAdapt = selSession && selReason && !selDone ? adaptMissedSession(selSession, selReason, ctx) : null;

  const onDone = () => {
    logEntrenoSession(selSession!.id);
    setPicked(null);
    setReasonsOpen(false);
  };
  const onReason = (reason: SkipReason) => {
    skipEntrenoSession(selSession!.id, reason);
    if (weekSel != null) setPicked({ idx: weekSel, reason });
    setReasonsOpen(false);
  };

  const weekDetail = entrenoOn && (
    <div className="flex-none border-t border-[var(--rule2)] px-6 py-4">
      {selSession ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-mono text-[9px] tracking-[0.16em] text-[var(--acc)]">{t.calendar.outingOn}</span>
            <span className="text-[15px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
              {sessionTitle(selSession)}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint2)]">
              {t.routine.dow[weekSel!]} {weekDates[weekSel!].getDate()} · {months[weekDates[weekSel!].getMonth()].slice(0, 3).toUpperCase()}
            </span>
            {startTime(selSession) && (
              <span className="font-pixel text-[14px] leading-none tabular-nums text-[var(--acc)]">{startTime(selSession)}</span>
            )}
            {selDone && <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--acc)]">{t.entreno.status.done}</span>}
            {selReason && !selDone && (
              <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint2)]">
                {t.entreno.status.skipped} · {t.entreno.reasons[selReason]}
              </span>
            )}
            <span className="flex-1" />
            {selIsToday ? (
              <div className="flex flex-none flex-wrap items-center gap-2">
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
            ) : (
              <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)]">{t.calendar.todayOnly}</span>
            )}
          </div>

          {selIsToday && reasonsOpen && (
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

          {selAdapt && <AdaptationPanel adapt={selAdapt} />}
        </>
      ) : (
        <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint2)]">{t.calendar.pickDay}</span>
      )}
    </div>
  );

  // ── MES — per-date override grid (absorbs Rutina's month). effectiveSlot/effectiveKind. ─
  const fmtDate = (key: string) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    const wd = (new Date(yy, mm - 1, dd).getDay() + 6) % 7;
    return `${t.routine.dow[wd]} ${dd} · ${months[mm - 1].slice(0, 3).toUpperCase()}`;
  };
  const monthPane = (() => {
    const { y, m0 } = calMonth;
    const firstWeekday = (new Date(y, m0, 1).getDay() + 6) % 7;
    const start = new Date(y, m0, 1 - firstWeekday);
    const cells = Array.from({ length: 42 }, (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
    const selSlot = selDate ? effectiveSlot(week, dayOverrides, selDate) : REST;
    const selKind = selDate ? effectiveKind(dayKind, dayOverrides, selDate) : null;
    const selHasOv = selDate ? selDate in dayOverrides : false;
    return (
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} aria-label={t.cal.prev} className="grid size-7 place-items-center border border-[var(--rule2)] text-[var(--dim)] hover:text-[var(--fg)]">
              ‹
            </button>
            <span className="font-pixel text-[18px] tracking-[0.02em] text-[var(--fg)]">
              {months[m0]} {y}
            </span>
            <button onClick={nextMonth} aria-label={t.cal.next} className="grid size-7 place-items-center border border-[var(--rule2)] text-[var(--dim)] hover:text-[var(--fg)]">
              ›
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {t.routine.dow.map((d) => (
              <span key={d} className="text-center font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">
                {d}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((dt) => {
              const key = dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
              const outMonth = dt.getMonth() !== m0;
              const slot = effectiveSlot(week, dayOverrides, key);
              const rest = slot === REST;
              const dtName = dayTypes.find((x) => x.id === slot)?.name ?? slot;
              const hasOv = key in dayOverrides;
              const isToday = key === todayK;
              const isSel = key === selDate;
              const place = effectiveKind(dayKind, dayOverrides, key);
              // Entreno outing for this date's weekday (follows the weekly pattern). Off → none.
              const outing = entrenoOn
                ? entrenoSessions.find((s) => s.id === entrenoWeek[(dt.getDay() + 6) % 7])
                : undefined;
              return (
                <button
                  key={key}
                  onClick={() => setSelDate(key)}
                  className="relative flex h-[72px] flex-col border p-1.5 text-left"
                  style={{
                    borderColor: isSel ? "var(--acc)" : isToday ? "color-mix(in oklch, var(--acc) 45%, transparent)" : "var(--rule)",
                    background: isSel ? "color-mix(in oklch, var(--acc) 9%, transparent)" : "transparent",
                    opacity: outMonth ? 0.4 : 1,
                  }}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-mono text-[10px]" style={{ color: isToday ? "var(--acc)" : "var(--faint)" }}>
                      {dt.getDate()}
                    </span>
                    {hasOv && <span title={t.cal.overrideTag} className="size-1.5 flex-none bg-[var(--acc)]" />}
                  </span>
                  <span
                    className="mt-auto truncate text-[10px] font-semibold uppercase"
                    style={{ color: rest ? "var(--faint2)" : "var(--fg)" }}
                  >
                    {rest ? t.today.rest : dtName}
                  </span>
                  {outing && (
                    <span className="flex items-baseline gap-1">
                      <span className="min-w-0 truncate font-mono text-[8.5px] font-semibold tracking-[0.04em] text-[var(--acc)]">
                        {outing.name?.trim().toUpperCase() || t.entreno.modalities[outing.modality].toUpperCase()}
                      </span>
                      {startTime(outing) && (
                        <span className="flex-none font-mono text-[8px] tabular-nums text-[var(--faint2)]">{startTime(outing)}</span>
                      )}
                    </span>
                  )}
                  {place && (
                    <span className="font-mono text-[8px] tracking-[0.06em] text-[var(--faint2)]">
                      {place === "home" ? t.week.home : t.week.office}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selDate && (
          <div className="flex-none border-t border-[var(--rule2)] px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-mono text-[9px] tracking-[0.16em] text-[var(--acc)]">{t.cal.dayPlan}</span>
              <span className="text-[15px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">{fmtDate(selDate)}</span>
              <select
                value={selSlot}
                onChange={(e) => setDayOverride(selDate, { slot: e.currentTarget.value })}
                aria-label={t.calendar.dayType}
                className={`${input} appearance-none px-2.5 py-1.5 font-mono text-[11.5px]`}
              >
                {dayTypes.map((x) => (
                  <option key={x.id} value={x.id} className="bg-[var(--ink2)]">
                    {x.name.toUpperCase()}
                  </option>
                ))}
                <option value={REST} className="bg-[var(--ink2)]">
                  {t.today.rest.toUpperCase()}
                </option>
              </select>
              <div className="flex gap-1.5">
                {([null, "home", "office"] as const).map((k) => {
                  const on = selKind === k;
                  return (
                    <button
                      key={String(k)}
                      onClick={() => setDayOverride(selDate, { kind: k })}
                      aria-label={t.week.place}
                      className="border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.04em]"
                      style={{
                        borderColor: on ? "var(--acc)" : "var(--rule2)",
                        color: on ? "var(--acc)" : "var(--faint)",
                        background: on ? "color-mix(in oklch, var(--acc) 7%, transparent)" : "transparent",
                      }}
                    >
                      {k === null ? "—" : k === "home" ? t.week.home.toUpperCase() : t.week.office.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              <span className="flex-1" />
              {selHasOv ? (
                <button
                  onClick={() => clearDayOverride(selDate)}
                  className="flex items-center gap-1.5 border border-[var(--rule2)] px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
                >
                  <Trash2 className="size-3.5" /> {t.cal.useWeekly}
                </button>
              ) : (
                <span className="font-mono text-[9.5px] tracking-[0.06em] text-[var(--faint2)]">◆ {t.cal.weeklyDefault}</span>
              )}
            </div>
          </div>
        )}
      </section>
    );
  })();

  const viewTab = (v: "semana" | "mes", label: string) => {
    const on = view === v;
    return (
      <button
        key={v}
        onClick={() => setView(v)}
        className="border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
        style={{
          borderColor: on ? "var(--acc)" : "var(--rule2)",
          background: on ? "var(--acc)" : "transparent",
          color: on ? "var(--on)" : "var(--faint)",
        }}
      >
        {label}
      </button>
    );
  };

  const weekOfKicker = `${t.calendar.weekOf} ${weekDates[0].getDate()} ${months[weekDates[0].getMonth()].slice(0, 3).toUpperCase()}`;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker={view === "semana" ? weekOfKicker : t.calendar.sub}
        title={t.calendar.title}
        right={
          <>
            {viewTab("semana", t.cal.week)}
            {viewTab("mes", t.cal.month)}
          </>
        }
      />
      {view === "mes" ? (
        monthPane
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          {weekStrip}
          <div className="min-h-0 flex-1 overflow-y-auto" />
          {weekDetail}
        </section>
      )}
    </div>
  );
}
