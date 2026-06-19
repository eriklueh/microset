import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { analyzeRoutine } from "@/coach/analysis";
import { createDayPlan, effectiveSettings } from "@/lib/engine";
import { defaultVariantId, isAvailable } from "@/domain/seed";
import { useIntensities } from "@/domain/i18n";
import { scaleSets } from "@/domain/intensity";
import type { EquipmentId, ExerciseContext, Measure, MuscleGroup } from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { REST, dateKey, effectiveKind, effectiveSlot, useStore } from "@/store/useStore";
import {
  BODY_GROUPS,
  GROUP_MUSCLES,
  MUSCLE_GROUP,
  aggregateState,
  coveredGroupsFromRoles,
  cycleRole,
  groupWorked,
  mergeStates,
  presetRoles,
  rolesToState,
  singleState,
  suggestFromName,
  workedGroupCount,
  type BodyGroup,
  type Role,
} from "@/domain/bodyGroups";
import { BodyLegend, GroupChips, ModelRail } from "./BodyMap";
import { FeasibilityHint, FeasibilityTag } from "./Feasibility";
import { ViewHeader } from "./shell";

type Mode = "list" | "crear" | "buscar";

/** Pattern selector order (Empuje · Tirón · Piernas · Core). */
const PATTERN_ORDER: MuscleGroup[] = ["push", "pull", "legs", "core"];
/** Catalog grouping order for the browse list. */
const BROWSE_ORDER: MuscleGroup[] = ["pull", "push", "core", "legs"];
const WARN = "#e8913c";
const input =
  "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";
const stepBtn =
  "grid size-7 place-items-center border border-[var(--rule2)] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]";
const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6

export function RoutineView() {
  const t = useT();
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const dayKind = useStore((s) => s.dayKind);
  const setWeekDay = useStore((s) => s.setWeekDay);
  const setDayKind = useStore((s) => s.setDayKind);
  const dayOverrides = useStore((s) => s.dayOverrides);
  const setDayOverride = useStore((s) => s.setDayOverride);
  const clearDayOverride = useStore((s) => s.clearDayOverride);
  const owned = useStore((s) => s.ownedEquipment);
  const settings = useStore((s) => s.settings);
  const setIntensity = useStore((s) => s.setIntensity);
  const setDaySchedule = useStore((s) => s.setDaySchedule);
  const setRoutineSets = useStore((s) => s.setRoutineSets);
  const setRoutineTarget = useStore((s) => s.setRoutineTarget);
  const setRoutineVariant = useStore((s) => s.setRoutineVariant);
  const removeFromRoutine = useStore((s) => s.removeFromRoutine);
  const moveRoutineItem = useStore((s) => s.moveRoutineItem);
  const addToRoutine = useStore((s) => s.addToRoutine);
  const addDayType = useStore((s) => s.addDayType);
  const renameDayType = useStore((s) => s.renameDayType);
  const removeDayType = useStore((s) => s.removeDayType);
  const addCustomExercise = useStore((s) => s.addCustomExercise);

  const { all, byId, name, variantLabel, allEquipment, eqName } = useCatalog();
  const intensities = useIntensities();
  const [selectedId, setSelectedId] = useState(dayTypes[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const [hoverEx, setHoverEx] = useState<string | null>(null);
  const [planView, setPlanView] = useState<"semana" | "mes">("semana");
  const [renaming, setRenaming] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m0: d.getMonth() };
  });
  const [selDate, setSelDate] = useState<string | null>(null);
  const today = new Date();
  const todayK = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const prevMonth = () => setCalMonth((c) => (c.m0 === 0 ? { y: c.y - 1, m0: 11 } : { y: c.y, m0: c.m0 - 1 }));
  const nextMonth = () => setCalMonth((c) => (c.m0 === 11 ? { y: c.y + 1, m0: 0 } : { y: c.y, m0: c.m0 + 1 }));

  // create-form state (lifted so the cockpit body can both preview and edit it)
  const [cName, setCName] = useState("");
  const [cPattern, setCPattern] = useState<MuscleGroup>("push");
  const [cMetric, setCMetric] = useState<Measure>("reps");
  const [cReps, setCReps] = useState("8");
  const [cSeries, setCSeries] = useState(3);
  const [cEquip, setCEquip] = useState<EquipmentId[]>([]);
  const [cContext, setCContext] = useState<ExerciseContext>("space");
  const [cRoles, setCRoles] = useState<Record<string, Role>>(() => presetRoles("push"));

  const selected = dayTypes.find((d) => d.id === selectedId) ?? dayTypes[0];
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="border border-[var(--rule2)] p-8 text-center text-[13px] text-[var(--faint)]">
          {t.routine.noDayTypes}
        </div>
      </div>
    );
  }
  const routine = selected.routine;
  const dayIntensity = selected.intensity ?? "normal";
  // Per-day schedule override (own window/rest) — falls back to the global settings.
  const ownSchedule = !!selected.window || selected.minRest != null;
  const win = selected.window ?? settings.workWindow;
  const restMin = selected.minRest ?? settings.minRest;
  const winDur = Math.max(1, win.end - win.start);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const parseHHMM = (s: string) => {
    const [h, mm] = s.split(":").map((n) => parseInt(n, 10));
    return (h || 0) * 60 + (mm || 0);
  };
  // intensity scales the SCHEDULED sets (non-destructive) — header/coverage reflect that
  const effRoutine = routine.map((r) => ({ ...r, sets: scaleSets(r.sets, dayIntensity) }));
  // Live preview: where the sets actually land with this day's schedule (window-start as "now"
  // so it's time-of-day stable). Feeds the mini-timeline so window/rest density is visible.
  const schedSettings = effectiveSettings(settings, selected);
  const previewMins = createDayPlan(
    effRoutine.filter((r) => {
      const ex = byId(r.exerciseId);
      return ex ? isAvailable(ex, owned) : true;
    }),
    schedSettings,
    schedSettings.workWindow.start,
  )
    .blocks.filter((b) => b.time >= 0)
    .map((b) => b.time)
    .sort((a, b) => a - b);
  const avgGap =
    previewMins.length > 1
      ? Math.round((previewMins[previewMins.length - 1] - previewMins[0]) / (previewMins.length - 1))
      : 0;
  const regions = t.body.regions as Record<string, string>;
  const regionLabel = (g: BodyGroup) => regions[g].toUpperCase();
  const muscleName = (mu: string) => (t.body.muscleNames as Record<string, string>)[mu] ?? mu;

  const inRoutine = new Set(routine.map((r) => r.exerciseId));
  const available = all.filter(
    (e) =>
      isAvailable(e, owned) &&
      !inRoutine.has(e.id) &&
      e.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const { totalSets, fits } = analyzeRoutine(effRoutine, owned, effectiveSettings(settings, selected), byId);
  const aggState = aggregateState(effRoutine, byId, owned);
  const worked = workedGroupCount(aggState);
  const legGap = totalSets > 0 && !groupWorked(aggState, "legs");

  // create-mode derived
  const creating = mode === "crear";
  const previewState = rolesToState(cRoles);
  const covered = coveredGroupsFromRoles(cRoles);
  const primCount = Object.values(cRoles).filter((r) => r === "primary").length;
  const secCount = Object.values(cRoles).filter((r) => r === "secondary").length;
  const projWorked = workedGroupCount(mergeStates(aggState, previewState));
  const closesGap = creating && legGap && !!covered.legs;
  const sug = suggestFromName(cName);
  const sugApplied = !!sug && Object.keys(sug.muscles).every((k) => cRoles[k] === sug.muscles[k]);
  const missing: string[] = [];
  if (!cName.trim()) missing.push(t.routine.missName);
  if (primCount < 1) missing.push(t.routine.missPrimary);
  const ctaReady = missing.length === 0;

  // body painted: create → live selection; list → hovered isolate or whole-day aggregate
  const hovered = hoverEx ? byId(hoverEx) : undefined;
  const bodyState = creating ? previewState : hovered ? singleState(hovered) : aggState;

  const openCreate = () => {
    setCName("");
    setCPattern("push");
    setCRoles(presetRoles("push"));
    setCMetric("reps");
    setCReps("8");
    setCSeries(3);
    setCEquip([]);
    setCContext("space");
    setMode("crear");
  };
  const setPattern = (p: MuscleGroup) => {
    setCPattern(p);
    setCRoles(presetRoles(p));
  };
  const cycleMuscle = (mu: string) => {
    if (!MUSCLE_GROUP[mu]) return; // ignore head/neck/knees/soleus
    setCRoles((r) => {
      const next = cycleRole(r[mu]);
      const out = { ...r };
      if (next === "none") delete out[mu];
      else out[mu] = next;
      return out;
    });
  };
  const applySuggest = () => {
    if (sug) {
      setCPattern(sug.pattern);
      setCRoles({ ...sug.muscles });
    }
  };
  const toggleEq = (id: EquipmentId) =>
    setCEquip((eq) => (eq.includes(id) ? eq.filter((e) => e !== id) : [...eq, id]));

  const handleCreate = () => {
    const primary = Object.keys(cRoles).filter((m) => cRoles[m] === "primary");
    const secondary = Object.keys(cRoles).filter((m) => cRoles[m] === "secondary");
    if (!cName.trim() || primary.length === 0) return;
    const ex = addCustomExercise({
      name: cName.trim(),
      muscle: cPattern,
      primary,
      secondary: secondary.length ? secondary : undefined,
      equipment: cEquip,
      measure: cMetric,
      context: cContext,
      defaultReps: cReps.trim() || (cMetric === "hold" ? "20s" : "8"),
      defaultSets: cSeries,
    });
    addToRoutine(selected.id, {
      exerciseId: ex.id,
      name: ex.name,
      sets: ex.defaultSets,
      target: ex.defaultReps,
      variantId: "bw",
    });
    setMode("list");
  };

  // ----- shared header chrome ------------------------------------------------
  const dayTypePills = (
    <>
      {dayTypes.map((dt) => {
        const on = selected.id === dt.id;
        // active tab in list mode = rename (double-click) + delete (×)
        if (on && mode === "list" && renaming) {
          return (
            <input
              key={dt.id}
              autoFocus
              value={dt.name}
              onChange={(e) => renameDayType(dt.id, e.currentTarget.value)}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setRenaming(false);
              }}
              aria-label={t.routine.dayTypeNameAria}
              className="border border-[var(--acc)] bg-transparent px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--fg)] outline-none"
              style={{ width: `${Math.max(7, dt.name.length + 2)}ch` }}
            />
          );
        }
        return (
          <button
            key={dt.id}
            onClick={() => setSelectedId(dt.id)}
            onDoubleClick={() => on && mode === "list" && setRenaming(true)}
            title={on && mode === "list" ? t.routine.renameHint : undefined}
            className="flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
            style={{
              borderColor: on ? "var(--acc)" : "var(--rule2)",
              background: on ? "var(--acc)" : "transparent",
              color: on ? "var(--on)" : "var(--dim)",
            }}
          >
            {dt.name.toUpperCase()}
            {on && mode === "list" && dayTypes.length > 1 && (
              <span
                role="button"
                aria-label={t.routine.deleteDayTypeAria}
                onClick={(e) => {
                  e.stopPropagation();
                  removeDayType(dt.id);
                }}
                className="-mr-1 grid size-3.5 place-items-center hover:opacity-60"
              >
                <X className="size-3" />
              </span>
            )}
          </button>
        );
      })}
      {mode === "list" && (
        <button
          onClick={() => setSelectedId(addDayType(t.routine.newDayType))}
          className="flex items-center gap-1 border border-dashed border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--faint)] hover:text-[var(--fg)]"
        >
          <Plus className="size-3.5" /> {t.routine.type}
        </button>
      )}
    </>
  );

  const modeTab = (label: string, val: Mode) => {
    const on = mode === val;
    return (
      <button
        onClick={() => setMode(val)}
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

  const header = (
    <ViewHeader
      onBack={mode !== "list" ? () => setMode("list") : undefined}
      backLabel={t.routine.title}
      kicker={mode === "list" ? t.routine.sub : mode === "buscar" ? t.routine.fromLibrary : t.routine.newExercise}
      title={mode === "list" ? t.routine.title : mode === "buscar" ? t.routine.searchTitle : cName || t.routine.unnamed}
      titleMuted={mode === "crear" && !cName}
      right={
        mode === "list" ? (
          <>
            <span className="font-mono text-[11px] tracking-[0.06em]">
              <span className="text-[var(--faint)]">{t.routine.sets} </span>
              <span className="font-semibold text-[var(--fg)]">{totalSets}</span>
            </span>
            <FeasibilityTag fits={fits} total={totalSets} />
            <select
              value={dayIntensity}
              onChange={(e) => setIntensity(selected.id, e.currentTarget.value as "deload" | "normal" | "push")}
              aria-label={t.routine.dayIntensityAria}
              title={intensities.byId(dayIntensity)?.description}
              className={`${input} appearance-none px-2.5 py-1.5 font-mono text-[11px]`}
              style={{ color: dayIntensity === "normal" ? "var(--dim)" : "var(--acc)" }}
            >
              {intensities.all.map((m) => (
                <option key={m.id} value={m.id} className="bg-[var(--ink2)]">
                  {m.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            {modeTab(t.routine.tabCreate, "crear")}
            {modeTab(t.routine.tabBrowse, "buscar")}
          </>
        )
      }
      context={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {mode !== "list" && (
            <span className="mr-0.5 font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)]">{t.routine.addTo}</span>
          )}
          {dayTypePills}
        </div>
      }
    />
  );

  // [SEMANA | MES] toggle — lives at the top of the right working pane so the
  // cockpit (left) stays anchored across modes (no UI shift on add-exercise).
  const planBar = (
    <div className="flex flex-none items-center gap-1.5 border-b border-[var(--rule2)] px-6 py-2">
      {(["semana", "mes"] as const).map((v) => {
        const on = planView === v;
        return (
          <button
            key={v}
            onClick={() => setPlanView(v)}
            className="border px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.12em]"
            style={{
              borderColor: on ? "var(--acc)" : "var(--rule2)",
              background: on ? "var(--acc)" : "transparent",
              color: on ? "var(--on)" : "var(--faint)",
            }}
          >
            {v === "semana" ? t.cal.week : t.cal.month}
          </button>
        );
      })}
    </div>
  );

  // ----- week strip (the merged Semana view): assign a day-type + place per day -
  const weekStrip = (
    <div className="flex flex-none border-b border-[var(--rule2)]">
      {t.routine.dow.map((d, i) => {
        const isToday = i === todayIdx;
        const slot = week[i];
        const isRest = slot === REST;
        const editing = !isRest && slot === selected.id;
        const place = dayKind[i];
        return (
          <div
            key={i}
            className="relative min-w-0 flex-1 border-r border-[var(--rule)] p-2 last:border-r-0"
            style={{ background: editing ? "color-mix(in oklch, var(--acc) 7%, transparent)" : "transparent" }}
          >
            {editing && <span className="absolute inset-x-0 top-0 h-0.5 bg-[var(--acc)]" />}
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => !isRest && setSelectedId(slot)}
                title={isRest ? undefined : t.routine.editDayHint}
                className="min-w-0 flex-1 truncate text-left font-mono text-[9.5px] tracking-[0.14em]"
                style={{ color: isToday ? "var(--acc)" : "var(--faint)", cursor: isRest ? "default" : "pointer" }}
              >
                {d}
                {isToday ? " ·" : ""}
              </button>
              <button
                onClick={() => setDayKind(i, place === null ? "home" : place === "home" ? "office" : null)}
                aria-label={`${t.week.place} ${d}`}
                title={place === "home" ? t.week.home : place === "office" ? t.week.office : t.week.place}
                className="grid size-4 flex-none place-items-center font-mono text-[9px] font-semibold hover:text-[var(--fg)]"
                style={{ color: place ? "var(--acc)" : "var(--faint2)" }}
              >
                {place ? (place === "home" ? t.week.home : t.week.office).charAt(0).toUpperCase() : "·"}
              </button>
            </div>
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
          </div>
        );
      })}
    </div>
  );

  // ----- month calendar (per-date overrides over the weekly pattern) ---------
  const months = t.cal.months as string[];
  const fmtDate = (key: string) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    const wd = (new Date(yy, mm - 1, dd).getDay() + 6) % 7;
    return `${t.routine.dow[wd]} ${dd} · ${months[mm - 1].slice(0, 3).toUpperCase()}`;
  };
  const monthInner = (() => {
    const { y, m0 } = calMonth;
    const firstWeekday = (new Date(y, m0, 1).getDay() + 6) % 7;
    const start = new Date(y, m0, 1 - firstWeekday);
    const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const selSlot = selDate ? effectiveSlot(week, dayOverrides, selDate) : REST;
    const selKind = selDate ? effectiveKind(dayKind, dayOverrides, selDate) : null;
    const selHasOv = selDate ? selDate in dayOverrides : false;
    return (
      <>
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
              return (
                <button
                  key={key}
                  onClick={() => setSelDate(key)}
                  className="relative flex h-[62px] flex-col border p-1.5 text-left"
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
                aria-label={t.routine.type}
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
      </>
    );
  })();

  // ----- gap / coverage card (mode-aware) ------------------------------------
  type Tone = "acc" | "warn" | "neutral";
  const card: { tone: Tone; title: string; big: number; tag: string; sub?: string; ok: boolean } = creating
    ? closesGap
      ? { tone: "acc", title: t.body.closesLegs, big: projWorked, tag: t.body.groupsAtCreate, ok: true }
      : legGap
        ? { tone: "warn", title: t.body.stillLegs, big: worked, tag: t.body.legsUncovered, ok: false }
        : { tone: "neutral", title: t.body.dayCoverage, big: projWorked, tag: t.body.groups, ok: true }
    : legGap
      ? {
          tone: "warn",
          title: `${regions.legs} ${t.body.untrained}`,
          big: worked,
          tag: t.body.legsUncovered,
          sub: t.body.gapSub,
          ok: false,
        }
      : { tone: "acc", title: t.body.dayCoverage, big: worked, tag: t.body.groupsCovered, ok: true };

  const toneStyle =
    card.tone === "warn"
      ? { border: "rgba(232,145,60,0.4)", bg: "rgba(232,145,60,0.06)", fg: WARN, title: "var(--dim)" }
      : card.tone === "acc"
        ? {
            border: "color-mix(in oklch, var(--acc) 40%, transparent)",
            bg: "color-mix(in oklch, var(--acc) 6%, transparent)",
            fg: "var(--acc)",
            title: "var(--acc)",
          }
        : { border: "var(--rule2)", bg: "transparent", fg: "var(--faint2)", title: "var(--fg)" };

  const gapCard = (
    <div className="border p-3.5" style={{ borderColor: toneStyle.border, background: toneStyle.bg }}>
      <div className="flex items-center gap-2">
        {card.ok ? (
          <Check className="size-4 flex-none" style={{ color: toneStyle.fg }} />
        ) : (
          <AlertTriangle className="size-4 flex-none" style={{ color: toneStyle.fg }} />
        )}
        <span className="text-[13.5px] font-bold" style={{ color: toneStyle.title }}>
          {card.title}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-pixel text-[34px] leading-[0.8] text-[var(--fg)]">{card.big}</span>
        <span className="font-pixel text-[18px] text-[var(--faint2)]">/6</span>
        <span className="ml-auto self-end font-mono text-[9px] tracking-[0.08em]" style={{ color: toneStyle.fg }}>
          {card.tag}
        </span>
      </div>
      {card.sub && <div className="mt-1.5 font-mono text-[9.5px] tracking-[0.04em] text-[var(--faint)]">{card.sub}</div>}
    </div>
  );

  // ----- left cockpit (anchored across modes; shared ModelRail = same Y as Hoy/Progreso) ----
  const leftCol = (
    <ModelRail
      label={
        creating
          ? t.body.musclesNew
          : hovered
            ? `${t.body.isolated} · ${name(hoverEx!).toUpperCase()}`
            : t.body.coverageDay
      }
      meta={
        creating ? (
          `${primCount}P · ${secCount}S`
        ) : (
          <>
            <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
            {t.body.live}
          </>
        )
      }
      state={bodyState}
      onPick={creating ? cycleMuscle : undefined}
    >
      <BodyLegend />
      <div className="text-center font-mono text-[9px] tracking-[0.06em] text-[var(--faint2)]">
        {creating ? t.body.pickHint : t.body.spreadHint}
      </div>
      {!creating && totalSets > 0 && fits < totalSets && (
        <div className="border-l-2 px-2.5 py-2" style={{ borderColor: WARN }}>
          <FeasibilityHint />
        </div>
      )}
      {!creating && (
        <div className="flex flex-col gap-2 border border-[var(--rule2)] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] tracking-[0.14em] text-[var(--faint)]">{t.routine.scheduleLabel}</span>
            <div className="flex flex-none">
              {[false, true].map((own) => {
                const on = own === ownSchedule;
                return (
                  <button
                    key={String(own)}
                    onClick={() =>
                      setDaySchedule(
                        selected.id,
                        own
                          ? { window: selected.window ?? { start: 1200, end: 1245 }, minRest: selected.minRest ?? 5 }
                          : { window: null, minRest: null },
                      )
                    }
                    className="border px-2 py-[3px] font-mono text-[9px] tracking-[0.08em]"
                    style={{
                      marginLeft: own ? -1 : 0,
                      borderColor: on ? "var(--acc)" : "var(--rule2)",
                      color: on ? "var(--on)" : "var(--dim)",
                      background: on ? "var(--acc)" : "transparent",
                    }}
                  >
                    {own ? t.routine.scheduleOwn : t.routine.scheduleGlobal}
                  </button>
                );
              })}
            </div>
          </div>

          {ownSchedule ? (
            <>
              {[
                {
                  label: t.routine.scheduleStart,
                  el: (
                    <input
                      type="time"
                      value={hhmm(win.start)}
                      onChange={(e) => {
                        const ns = parseHHMM(e.currentTarget.value);
                        setDaySchedule(selected.id, { window: { start: ns, end: ns + winDur } });
                      }}
                      className={`${input} px-1.5 py-1 font-mono text-[11px] [color-scheme:dark]`}
                    />
                  ),
                },
                {
                  label: t.routine.scheduleDuration,
                  el: (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        max={600}
                        step={5}
                        value={winDur}
                        onChange={(e) =>
                          setDaySchedule(selected.id, {
                            window: { start: win.start, end: win.start + Math.max(5, +e.currentTarget.value) },
                          })
                        }
                        className={`${input} w-14 px-1.5 py-1 text-center font-mono text-[11px]`}
                      />
                      <span className="font-mono text-[9px] text-[var(--faint2)]">min</span>
                    </span>
                  ),
                },
                {
                  label: t.routine.restEvery,
                  el: (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={restMin}
                        onChange={(e) => setDaySchedule(selected.id, { minRest: +e.currentTarget.value })}
                        className={`${input} w-14 px-1.5 py-1 text-center font-mono text-[11px]`}
                      />
                      <span className="font-mono text-[9px] text-[var(--faint2)]">min</span>
                    </span>
                  ),
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--faint)]">{row.label}</span>
                  {row.el}
                </div>
              ))}

              {/* mini-timeline: each dot is a set placed in the window */}
              <div className="relative mt-0.5 h-6 overflow-hidden border border-[var(--rule2)] bg-[var(--bar0)]">
                {previewMins.map((m, i) => (
                  <span
                    key={i}
                    className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--acc)]"
                    style={{ left: `${Math.max(2, Math.min(98, ((m - win.start) / winDur) * 100))}%` }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between font-mono text-[8.5px] tracking-[0.06em] text-[var(--faint2)]">
                <span>{hhmm(win.start)}</span>
                <span className="text-[var(--faint)]">
                  {previewMins.length} {t.routine.sets}
                  {avgGap ? ` · ~${avgGap}m` : ""}
                </span>
                <span>{hhmm(win.end)}</span>
              </div>
            </>
          ) : (
            <div className="font-mono text-[9px] leading-[1.6] tracking-[0.04em] text-[var(--faint2)]">
              {t.routine.scheduleSpread} {hhmm(settings.workWindow.start)}–{hhmm(settings.workWindow.end)} ·{" "}
              {t.routine.restEvery} {settings.minRest} min
            </div>
          )}
        </div>
      )}
      <div className="flex-1" />
      {gapCard}
    </ModelRail>
  );

  // ----- right pane: list / create / browse ----------------------------------
  const exRow = (r: (typeof routine)[number], i: number) => {
    const ex = byId(r.exerciseId);
    const orphan = ex ? !isAvailable(ex, owned) : false;
    const active = hoverEx === r.exerciseId;
    const moveBtn =
      "grid h-3.5 w-6 place-items-center text-[var(--faint2)] hover:text-[var(--fg)] disabled:opacity-25 disabled:hover:text-[var(--faint2)]";
    return (
      <div
        key={r.exerciseId}
        onMouseEnter={() => setHoverEx(r.exerciseId)}
        onMouseLeave={() => setHoverEx(null)}
        className="border-b border-[var(--rule)] py-3 transition-colors"
        style={{
          opacity: orphan ? 0.55 : 1,
          background: active ? "color-mix(in oklch, var(--acc) 6%, transparent)" : "transparent",
          paddingLeft: active ? 10 : 0,
          borderLeft: active ? "2px solid var(--acc)" : "2px solid transparent",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[18px] font-bold tracking-[-0.02em] text-[var(--fg)] uppercase">
              {name(r.exerciseId)}
            </span>
            {orphan && (
              <AlertTriangle className="size-3.5 shrink-0" style={{ color: WARN }} aria-label={t.routine.missingGearAria} />
            )}
          </div>
          <div className="flex flex-none items-center gap-2">
            <div className="mr-0.5 flex flex-col">
              <button
                onClick={() => moveRoutineItem(selected.id, r.exerciseId, -1)}
                disabled={i === 0}
                aria-label={t.routine.moveUpAria}
                className={moveBtn}
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                onClick={() => moveRoutineItem(selected.id, r.exerciseId, 1)}
                disabled={i === routine.length - 1}
                aria-label={t.routine.moveDownAria}
                className={moveBtn}
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
            <button onClick={() => setRoutineSets(selected.id, r.exerciseId, r.sets - 1)} aria-label={t.routine.fewerSetsAria} className={stepBtn}>
              <Minus className="size-3" />
            </button>
            <span className="grid h-7 w-9 place-items-center border-y border-[var(--rule2)] font-mono text-[12px] font-semibold text-[var(--fg)]">
              {r.sets}×
            </span>
            <button onClick={() => setRoutineSets(selected.id, r.exerciseId, r.sets + 1)} aria-label={t.routine.moreSetsAria} className={stepBtn}>
              <Plus className="size-3" />
            </button>
            <button
              onClick={() => removeFromRoutine(selected.id, r.exerciseId)}
              aria-label={t.routine.removeAria}
              className="ml-1 flex-none text-[var(--faint2)] hover:text-[var(--destructive)]"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {ex && <GroupChips ex={ex} />}
          <span className="flex-1" />
          <input
            value={r.target ?? ex?.defaultReps ?? ""}
            onChange={(e) => setRoutineTarget(selected.id, r.exerciseId, e.currentTarget.value)}
            aria-label={t.routine.repsOrDurationAria}
            className={`${input} h-7 w-16 text-center font-mono text-[12px]`}
          />
          {ex && ex.axis.length > 1 ? (
            <select
              value={r.variantId ?? defaultVariantId(ex)}
              onChange={(e) => setRoutineVariant(selected.id, r.exerciseId, e.currentTarget.value)}
              aria-label={t.routine.intensityAria}
              className={`${input} h-7 w-[124px] appearance-none px-2 font-mono text-[11px]`}
            >
              {ex.axis.map((v) => (
                <option key={v.id} value={v.id} className="bg-[var(--ink2)]">
                  {variantLabel(r.exerciseId, v.id)}
                </option>
              ))}
            </select>
          ) : (
            <span className="w-[124px] flex-none" />
          )}
        </div>
      </div>
    );
  };

  // The right working pane in list mode: plan toggle, then either the week strip +
  // exercise list (SEMANA) or the month calendar (MES). The cockpit stays anchored
  // on the left; switching to create/browse just swaps THIS pane's content.
  const listPane = (
    <section className="flex min-h-0 flex-1 flex-col">
      {planBar}
      {planView === "mes" ? (
        monthInner
      ) : (
        <>
          {weekStrip}
          <div className="flex flex-none items-center justify-between border-b border-[var(--rule2)] px-6 py-3">
            <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--faint)]">
              {t.routine.exercises} · {routine.length}
            </span>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-[var(--acc)] px-3.5 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--on)]"
            >
              <Plus className="size-3.5" /> {t.routine.addExercise}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            {routine.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--faint)]">{t.routine.emptyList}</p>
            ) : (
              routine.map((r, i) => exRow(r, i))
            )}
          </div>
        </>
      )}
    </section>
  );

  // segmented control
  const seg = (opts: { v: string; label: string }[], val: string, onSet: (v: string) => void) => (
    <div className="flex border border-[var(--rule2)]">
      {opts.map((o, i) => {
        const on = val === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onSet(o.v)}
            className="px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.04em]"
            style={{
              background: on ? "var(--acc)" : "transparent",
              color: on ? "var(--on)" : "var(--dim)",
              borderRight: i < opts.length - 1 ? "1px solid var(--rule2)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  const muscleChip = (mu: string) => {
    const r = cRoles[mu] ?? "none";
    const col = r === "primary" ? "var(--acc)" : r === "secondary" ? WARN : null;
    return (
      <button
        key={mu}
        onClick={() => cycleMuscle(mu)}
        className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[12px] font-medium select-none"
        style={{
          borderColor: col ?? "var(--rule2)",
          background: col
            ? r === "primary"
              ? "color-mix(in oklch, var(--acc) 8%, transparent)"
              : "rgba(232,145,60,0.08)"
            : "transparent",
          color: col ?? "var(--dim)",
        }}
      >
        <span
          className="size-2 flex-none"
          style={{ background: col ?? "transparent", border: col ? "none" : "1px solid var(--faint2)" }}
        />
        {muscleName(mu)}
      </button>
    );
  };

  const fLab = (txt: string) => (
    <div className="mb-2 font-mono text-[9px] tracking-[0.16em] text-[var(--faint2)]">{txt}</div>
  );

  const impactChips = BODY_GROUPS.filter((g) => covered[g]).map((g) => {
    const prim = covered[g] === "primary";
    return (
      <span
        key={g}
        className="inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
        style={{ borderColor: prim ? "var(--acc)" : WARN, color: prim ? "var(--acc)" : WARN }}
      >
        <span className="size-1.5" style={{ background: prim ? "var(--acc)" : WARN }} />
        {regionLabel(g)}
      </span>
    );
  });

  const createPane = (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {/* name + suggestion */}
        <div>
          {fLab(t.routine.exerciseNamePlaceholder)}
          <input
            value={cName}
            onChange={(e) => setCName(e.currentTarget.value)}
            placeholder="p. ej. Sentadilla búlgara"
            className={`${input} w-full px-4 py-3.5 text-[16px] font-semibold placeholder:text-[var(--faint2)]`}
          />
          {sug && !sugApplied && (
            <button
              onClick={applySuggest}
              className="mt-2 flex w-full items-center gap-2.5 border px-3 py-2.5 text-left"
              style={{
                borderColor: "color-mix(in oklch, var(--acc) 35%, transparent)",
                background: "color-mix(in oklch, var(--acc) 5%, transparent)",
              }}
            >
              <span className="flex-none font-mono text-[9px] tracking-[0.12em] text-[var(--acc)]">◆ {t.routine.suggested}</span>
              <span className="truncate text-[12.5px] text-[var(--dim)]">
                {t.routine.patternWord} {t.muscle[sug.pattern]} · {Object.keys(sug.muscles).length} {t.routine.musclesWord}
              </span>
              <span className="ml-auto flex-none bg-[var(--acc)] px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--on)]">
                {t.routine.apply}
              </span>
            </button>
          )}
        </div>

        {/* params: pattern · metric · series */}
        <div className="mt-6 flex flex-wrap gap-7">
          <div>
            {fLab(t.routine.pattern)}
            {seg(
              PATTERN_ORDER.map((p) => ({ v: p, label: t.muscle[p] })),
              cPattern,
              (p) => setPattern(p as MuscleGroup),
            )}
          </div>
          <div>
            {fLab(cMetric === "reps" ? t.routine.metricRepsLabel : t.routine.metricTimeLabel)}
            <div className="flex gap-1.5">
              {seg(
                [
                  { v: "reps", label: t.routine.optReps },
                  { v: "hold", label: t.routine.optTime },
                ],
                cMetric,
                (m) => setCMetric(m as Measure),
              )}
              <input
                value={cReps}
                onChange={(e) => setCReps(e.currentTarget.value)}
                placeholder={cMetric === "hold" ? "20s" : "8"}
                aria-label={t.routine.repsOrDurationAria}
                className={`${input} w-[72px] px-2 text-center font-mono text-[14px] font-semibold`}
              />
            </div>
          </div>
          <div>
            {fLab(t.routine.sets)}
            <div className="flex items-center border border-[var(--rule2)]">
              <button
                onClick={() => setCSeries((s) => Math.max(1, s - 1))}
                aria-label={t.routine.fewerSetsAria}
                className="grid h-[42px] w-9 place-items-center text-[var(--dim)] hover:text-[var(--fg)]"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-[46px] text-center font-mono text-[14px] font-semibold text-[var(--fg)]">{cSeries}×</span>
              <button
                onClick={() => setCSeries((s) => s + 1)}
                aria-label={t.routine.moreSetsAria}
                className="grid h-[42px] w-9 place-items-center text-[var(--dim)] hover:text-[var(--fg)]"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* muscles by region */}
        <div className="mt-7">
          <div className="mb-3 flex items-baseline gap-3">
            <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--fg)]">{t.routine.muscles.split(" ·")[0]}</span>
            <span className="font-mono text-[9px] tracking-[0.04em] text-[var(--faint2)]">◄ {t.routine.musclesPickHint}</span>
          </div>
          <div className="border-t border-[var(--rule)]">
            {BODY_GROUPS.map((g, i) => (
              <div
                key={g}
                className="flex items-start gap-4 py-2.5"
                style={{ borderTop: i ? "1px solid var(--rule)" : "none" }}
              >
                <span className="w-[80px] flex-none pt-2 font-mono text-[9.5px] tracking-[0.12em] text-[var(--faint)]">
                  {regionLabel(g)}
                </span>
                <div className="flex flex-wrap gap-2">{GROUP_MUSCLES[g].map(muscleChip)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* equipment + conditions */}
        <div className="mt-6">
          <div className="mb-3 font-mono text-[10px] tracking-[0.18em] text-[var(--fg)]">{t.routine.equipConditions}</div>
          <div className="flex flex-wrap gap-2">
            {allEquipment.map((eq) => {
              const on = cEquip.includes(eq.id);
              return (
                <button
                  key={eq.id}
                  onClick={() => toggleEq(eq.id)}
                  className="border px-3 py-2 font-mono text-[11px] tracking-[0.02em]"
                  style={{
                    borderColor: on ? "var(--acc)" : "var(--rule2)",
                    color: on ? "var(--acc)" : "var(--dim)",
                    background: on ? "color-mix(in oklch, var(--acc) 7%, transparent)" : "transparent",
                  }}
                >
                  {eqName(eq.id).toUpperCase()}
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex gap-2">
            {(
              [
                { c: "space", label: t.routine.needsSpace },
                { c: "desk", label: t.routine.deskOk },
              ] as { c: ExerciseContext; label: string }[]
            ).map(({ c, label }) => {
              const on = cContext === c;
              return (
                <button
                  key={c}
                  onClick={() => setCContext(c)}
                  className="inline-flex items-center gap-2 border px-3 py-2 font-mono text-[11px] tracking-[0.02em]"
                  style={{
                    borderColor: on ? "var(--acc)" : "var(--rule2)",
                    color: on ? "var(--acc)" : "var(--faint)",
                    background: on ? "color-mix(in oklch, var(--acc) 7%, transparent)" : "transparent",
                  }}
                >
                  <span
                    className="size-2 flex-none"
                    style={{ background: on ? "var(--acc)" : "transparent", border: on ? "none" : "1px solid var(--faint2)" }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* action bar */}
      <div className="flex flex-none items-center justify-between gap-4 border-t border-[var(--rule2)] px-7 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex-none font-mono text-[9px] tracking-[0.12em]"
            style={{ color: closesGap ? "var(--acc)" : "var(--faint2)" }}
          >
            {closesGap ? `✓ ${t.body.regions.legs.toUpperCase()}` : t.routine.impact}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {impactChips.length ? (
              impactChips
            ) : (
              <span className="font-mono text-[10px] text-[var(--faint2)]">{t.routine.pickMuscles}</span>
            )}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <button
            onClick={() => setMode("list")}
            className="border border-[var(--rule2)] px-5 py-3.5 font-mono text-[12px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:text-[var(--fg)]"
          >
            {t.routine.cancel}
          </button>
          <button
            disabled={!ctaReady}
            onClick={handleCreate}
            className="px-6 py-3.5 font-mono text-[12.5px] font-semibold tracking-[0.06em] whitespace-nowrap"
            style={{
              background: ctaReady ? "var(--acc)" : "color-mix(in oklch, var(--acc) 14%, transparent)",
              color: ctaReady ? "var(--on)" : "color-mix(in oklch, var(--acc) 55%, var(--faint))",
              cursor: ctaReady ? "pointer" : "not-allowed",
            }}
          >
            {ctaReady ? `${t.routine.createAndAdd} →` : `${t.routine.missingPrefix} ${missing.join(" · ").toUpperCase()}`}
          </button>
        </div>
      </div>
    </section>
  );

  const browsePane = (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none px-6 pt-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--faint2)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder={t.routine.searchPlaceholder}
            className={`${input} h-10 w-full pr-3 pl-9 font-mono text-[12px] tracking-[0.04em] placeholder:text-[var(--faint2)]`}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
        {BROWSE_ORDER.map((m) => {
          const group = available.filter((e) => e.muscle === m);
          if (group.length === 0) return null;
          return (
            <div key={m} className="mt-4 first:mt-2">
              <div className="font-mono text-[9.5px] tracking-[0.16em] text-[var(--faint2)]">{t.muscle[m].toUpperCase()}</div>
              <div className="mt-1.5">
                {group.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 border-t border-[var(--rule)] py-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-[var(--fg)]">{name(e.id)}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="font-mono text-[10px] text-[var(--faint)]">{e.defaultReps}</span>
                        <GroupChips ex={e} />
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        addToRoutine(selected.id, {
                          exerciseId: e.id,
                          name: e.name,
                          sets: e.defaultSets,
                          target: e.defaultReps,
                          variantId: defaultVariantId(e),
                        })
                      }
                      className="flex flex-none items-center gap-1.5 border px-3.5 py-2 font-mono text-[11px] font-semibold tracking-[0.06em]"
                      style={{ borderColor: "var(--acc)", color: "var(--acc)" }}
                    >
                      <Plus className="size-3.5" /> {t.routine.add}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {available.length === 0 && (
          <div className="mt-6 text-center">
            <p className="text-[13px] text-[var(--faint)]">
              {search ? `${t.routine.noResultsPre}"${search}".` : t.routine.noneLeft}
            </p>
            <button
              onClick={openCreate}
              className="mt-3 inline-flex items-center gap-1.5 border border-[var(--acc)] px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--acc)]"
            >
              <Plus className="size-3.5" /> {t.routine.createOwn}
            </button>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex min-h-0 flex-1">
        {leftCol}
        {mode === "crear" ? createPane : mode === "buscar" ? browsePane : listPane}
      </div>
    </div>
  );
}
