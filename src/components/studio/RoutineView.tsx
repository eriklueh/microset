import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Minus, Plus, Search, Trash2 } from "lucide-react";
import { analyzeRoutine } from "@/coach/analysis";
import { defaultVariantId, isAvailable } from "@/domain/seed";
import { useMethodologies } from "@/domain/i18n";
import type { EquipmentId, ExerciseContext, Measure, MuscleGroup } from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { useStore } from "@/store/useStore";
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
import { BodyFigures, BodyLegend, GroupChips } from "./BodyMap";
import { Barcode, Corners, RegMark } from "./hud";

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

export function RoutineView() {
  const t = useT();
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const owned = useStore((s) => s.ownedEquipment);
  const settings = useStore((s) => s.settings);
  const methodologyId = useStore((s) => s.methodologyId);
  const applyMethodology = useStore((s) => s.applyMethodology);
  const setRoutineSets = useStore((s) => s.setRoutineSets);
  const setRoutineTarget = useStore((s) => s.setRoutineTarget);
  const setRoutineVariant = useStore((s) => s.setRoutineVariant);
  const removeFromRoutine = useStore((s) => s.removeFromRoutine);
  const addToRoutine = useStore((s) => s.addToRoutine);
  const addDayType = useStore((s) => s.addDayType);
  const renameDayType = useStore((s) => s.renameDayType);
  const removeDayType = useStore((s) => s.removeDayType);
  const addCustomExercise = useStore((s) => s.addCustomExercise);

  const { all, byId, name, variantLabel, allEquipment, eqName } = useCatalog();
  const methodologies = useMethodologies();
  const [selectedId, setSelectedId] = useState(dayTypes[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const [hoverEx, setHoverEx] = useState<string | null>(null);

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
  const method = methodologies.byId(methodologyId) ?? methodologies.all[0];
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

  const { totalSets, fits, allFit } = analyzeRoutine(routine, owned, settings, byId);
  const aggState = aggregateState(routine, byId, owned);
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
        return (
          <button
            key={dt.id}
            onClick={() => setSelectedId(dt.id)}
            className="border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
            style={{
              borderColor: on ? "var(--acc)" : "var(--rule2)",
              background: on ? "var(--acc)" : "transparent",
              color: on ? "var(--on)" : "var(--dim)",
            }}
          >
            {dt.name.toUpperCase()}
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
        className="border px-4 py-2 font-mono text-[12px] font-semibold tracking-[0.06em]"
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
    <div className="flex-none px-7 pt-6">
      {/* breadcrumb */}
      <button
        onClick={mode === "list" ? undefined : () => setMode("list")}
        className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em]"
        style={{ cursor: mode === "list" ? "default" : "pointer" }}
      >
        {mode !== "list" && <ArrowLeft className="size-3.5 text-[var(--acc)]" />}
        <span className="text-[var(--faint)]">{t.routine.title}</span>
        <span className="text-[var(--faint2)]">/</span>
        <span className="text-[var(--faint2)]">{selected.name.toUpperCase()}</span>
      </button>

      {/* title row */}
      <div className="mt-3 flex items-end justify-between gap-5">
        <div className="min-w-0 max-w-[560px]">
          <div
            className="mb-1.5 font-mono text-[10px] tracking-[0.16em]"
            style={{ color: mode === "list" ? "var(--faint)" : "var(--acc)" }}
          >
            {mode === "list" ? t.routine.sub : mode === "buscar" ? t.routine.fromLibrary : t.routine.newExercise}
          </div>
          <h1
            className="m-0 truncate text-[34px] leading-[0.9] font-extrabold tracking-[-0.04em] uppercase"
            style={{
              color: mode === "crear" && !cName ? "var(--faint2)" : "var(--fg)",
            }}
          >
            {mode === "list"
              ? t.routine.title
              : mode === "buscar"
                ? t.routine.searchTitle
                : cName || t.routine.unnamed}
          </h1>
        </div>

        {mode === "list" ? (
          <div className="flex flex-none items-center gap-4">
            <span className="font-mono text-[11px] tracking-[0.06em]">
              <span className="text-[var(--faint)]">{t.routine.sets} </span>
              <span className="font-semibold text-[var(--fg)]">{totalSets}</span>
            </span>
            <span
              className="font-mono text-[11px] font-semibold tracking-[0.06em]"
              title={allFit ? undefined : t.routine.fitHint}
              style={{ color: totalSets === 0 ? "var(--faint2)" : allFit ? "var(--acc)" : WARN }}
            >
              {totalSets === 0 ? t.routine.empty : allFit ? t.routine.fits : `${t.routine.fitsCount} ${fits}/${totalSets}`}
            </span>
            <select
              value={methodologyId}
              onChange={(e) => applyMethodology(selected.id, e.currentTarget.value)}
              aria-label={t.routine.methodologyAria}
              title={method.description}
              className={`${input} appearance-none px-2.5 py-1.5 font-mono text-[11px]`}
            >
              {methodologies.all.map((m) => (
                <option key={m.id} value={m.id} className="bg-[var(--ink2)]">
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-none items-center gap-2.5">
            {modeTab(t.routine.tabCreate, "crear")}
            {modeTab(t.routine.tabBrowse, "buscar")}
          </div>
        )}
      </div>

      {/* pills */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {mode !== "list" && (
          <span className="mr-1 font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)]">{t.routine.addTo}</span>
        )}
        {dayTypePills}
      </div>
    </div>
  );

  const hudStrip = (
    <div className="mt-5 flex flex-none items-center gap-4 border-y border-[var(--rule)] px-7 py-2.5 font-mono text-[9.5px] tracking-[0.14em] text-[var(--faint2)]">
      <Barcode />
      <span>REF · MICROSET-RUT</span>
      <span className="text-[var(--faint2)]">CFG · {selected.name.toUpperCase()}</span>
      <span className="flex-1" />
      <span>SYNC 0.793</span>
      <span className="text-[var(--acc)]">UPTIME 0.978</span>
    </div>
  );

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

  // ----- left cockpit (anchored across modes) --------------------------------
  const leftCol = (
    <aside className="ms-rutina-rail flex w-[384px] flex-none flex-col gap-5 overflow-y-auto border-r border-[var(--rule2)] p-6">
      <div className="flex items-center gap-2">
        <input
          value={selected.name}
          onChange={(e) => renameDayType(selected.id, e.currentTarget.value)}
          aria-label={t.routine.dayTypeNameAria}
          className="min-w-0 flex-1 border-b border-transparent bg-transparent text-[20px] font-bold tracking-[-0.02em] text-[var(--fg)] outline-none focus:border-[var(--rule2)]"
        />
        <button
          disabled={dayTypes.length <= 1}
          onClick={() => removeDayType(selected.id)}
          aria-label={t.routine.deleteDayTypeAria}
          className="flex-none text-[var(--faint2)] hover:text-[var(--destructive)] disabled:opacity-30"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="-mt-2 flex gap-2 font-mono text-[10px] tracking-[0.06em]">
        {t.routine.dow.map((d, i) => (
          <span key={i} style={{ color: week[i] === selected.id ? "var(--acc)" : "var(--faint2)" }}>
            {d}
          </span>
        ))}
      </div>

      {/* label above body */}
      <div className="flex items-center justify-between">
        <span className="truncate font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">
          {creating
            ? t.body.musclesNew
            : hovered
              ? `${t.body.isolated} · ${name(hoverEx!).toUpperCase()}`
              : t.body.coverageDay}
        </span>
        <span className="flex flex-none items-center gap-1.5 font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
          {creating ? (
            `${primCount}P · ${secCount}S`
          ) : (
            <>
              <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
              {t.body.live}
            </>
          )}
        </span>
      </div>

      {/* body box with register chrome */}
      <div
        className="relative flex justify-center border border-[var(--rule2)] p-4"
        style={{ background: "radial-gradient(ellipse at 50% 32%, color-mix(in oklch, var(--acc) 5%, transparent), transparent 62%)" }}
      >
        <Corners />
        <RegMark className="top-2 left-2.5" />
        <BodyFigures state={bodyState} width={158} onPick={creating ? cycleMuscle : undefined} />
      </div>

      <BodyLegend />

      <div className="text-center font-mono text-[9px] tracking-[0.06em] text-[var(--faint2)]">
        {creating ? t.body.pickHint : t.body.spreadHint}
      </div>

      <div className="flex-1" />
      {gapCard}
    </aside>
  );

  // ----- right pane: list / create / browse ----------------------------------
  const exRow = (r: (typeof routine)[number]) => {
    const ex = byId(r.exerciseId);
    const orphan = ex ? !isAvailable(ex, owned) : false;
    const active = hoverEx === r.exerciseId;
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

  const listPane = (
    <section className="flex min-h-0 flex-1 flex-col">
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
          routine.map(exRow)
        )}
      </div>
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
      {hudStrip}
      <div className="flex min-h-0 flex-1">
        {leftCol}
        {mode === "crear" ? createPane : mode === "buscar" ? browsePane : listPane}
      </div>
    </div>
  );
}
