import { useState } from "react";
import { AlertTriangle, Minus, Plus, Search, Trash2 } from "lucide-react";
import { analyzeRoutine } from "@/coach/analysis";
import { defaultVariantId, isAvailable } from "@/domain/seed";
import { useMethodologies } from "@/domain/i18n";
import {
  type EquipmentId,
  type ExerciseContext,
  type Measure,
  type MuscleGroup,
} from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { useStore } from "@/store/useStore";
import { BodyFigures, BodyLegend, GroupChips, aggregateRoles, rolesState } from "./BodyMap";

const MUSCLE_ORDER: MuscleGroup[] = ["pull", "push", "core", "legs"];
const WARN = "#e0a400";
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

  const { all, byId, name, variantLabel } = useCatalog();
  const methodologies = useMethodologies();
  const [selectedId, setSelectedId] = useState(dayTypes[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [hoverEx, setHoverEx] = useState<string | null>(null);

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
  const usedDays = t.routine.dow.filter((_, i) => week[i] === selected.id);

  const inRoutine = new Set(routine.map((r) => r.exerciseId));
  const available = all.filter(
    (e) =>
      isAvailable(e, owned) &&
      !inRoutine.has(e.id) &&
      e.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const { totalSets, fits, allFit } = analyzeRoutine(routine, owned, settings, byId);
  const aggregate = aggregateRoles(routine, byId, owned);
  const worked = Object.values(aggregate).filter((r) => r !== "none").length;
  const hovered = hoverEx ? byId(hoverEx) : undefined;
  const bodyState = hovered ? rolesState(hovered) : aggregate;
  const legGap = totalSets > 0 && aggregate.legs === "none";
  const legSuggestions = legGap
    ? all.filter((e) => e.muscle === "legs" && isAvailable(e, owned) && !inRoutine.has(e.id))
    : [];

  const handleCreate = (i: {
    name: string;
    muscle: MuscleGroup;
    equipment: EquipmentId[];
    measure: Measure;
    context: ExerciseContext;
    defaultReps: string;
  }) => {
    const ex = addCustomExercise(i);
    addToRoutine(selected.id, {
      exerciseId: ex.id,
      name: ex.name,
      sets: ex.defaultSets,
      target: ex.defaultReps,
      variantId: "bw",
    });
    setCreating(false);
    setSearch("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* ===== Header band: title · stats · day-type tabs ===== */}
      <div className="flex-none border-b border-[var(--rule2)] px-7 pt-6 pb-3.5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[34px] leading-[0.82] font-extrabold tracking-[-0.04em] text-[var(--fg)] uppercase">
              {t.routine.title}
            </h2>
            <div className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-[var(--faint)]">
              {t.routine.sub}
            </div>
          </div>
          <div className="flex items-center gap-4">
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
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
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
          <button
            onClick={() => setSelectedId(addDayType(t.routine.newDayType))}
            className="flex items-center gap-1 border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--faint)] hover:text-[var(--fg)]"
          >
            <Plus className="size-3.5" /> {t.routine.type}
          </button>
        </div>
      </div>

      {/* ===== Split: body/balance rail · exercise list ===== */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT RAIL */}
        <aside className="ms-rutina-rail flex w-[340px] flex-none flex-col gap-5 overflow-y-auto border-r border-[var(--rule2)] p-5">
          {/* day-type identity */}
          <div className="flex items-center gap-2">
            <input
              value={selected.name}
              onChange={(e) => renameDayType(selected.id, e.currentTarget.value)}
              aria-label={t.routine.dayTypeNameAria}
              className="min-w-0 flex-1 border-b border-transparent bg-transparent text-[17px] font-bold tracking-[-0.01em] text-[var(--fg)] outline-none focus:border-[var(--rule2)]"
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
          <div className="-mt-3 font-mono text-[10px] tracking-[0.08em] text-[var(--faint2)]">
            {usedDays.length > 0 ? usedDays.join(" ") : t.routine.unassigned}
          </div>

          {/* balance score */}
          <div>
            <div className="font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">
              {t.body.coverage}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[40px] leading-[0.8] font-extrabold tracking-[-0.03em] text-[var(--fg)]">
                {worked}
              </span>
              <span className="text-[20px] font-extrabold text-[var(--faint2)]">/6</span>
              {legGap && (
                <span className="ml-1 font-mono text-[9.5px] tracking-[0.1em]" style={{ color: WARN }}>
                  {t.body.regions.legs.toUpperCase()} {t.body.untrained.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* body */}
          <div className="border border-[var(--rule2)] p-3">
            <div className="mb-2 flex items-center justify-between font-mono text-[9px] tracking-[0.14em] text-[var(--faint2)]">
              <span className="truncate">
                {hovered ? `${t.body.isolated} · ${name(hoverEx!).toUpperCase()}` : t.body.aggregate}
              </span>
              <span className="ms-blink flex-none text-[var(--acc)]">● SCAN</span>
            </div>
            <BodyFigures state={bodyState} width={138} />
            <div className="mt-3">
              <BodyLegend />
            </div>
          </div>

          {/* legs gap CTA */}
          {legGap && (
            <div
              className="border p-3"
              style={{ borderColor: "rgba(232,145,60,0.4)", background: "rgba(232,145,60,0.06)" }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 flex-none" style={{ color: WARN }} />
                <div className="text-[13px] font-bold" style={{ color: WARN }}>
                  {t.body.regions.legs} {t.body.untrained}
                </div>
              </div>
              <div className="mt-1 font-mono text-[9.5px] tracking-[0.04em] text-[var(--faint)]">
                {t.body.gapSub}
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {legSuggestions.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={() =>
                      addToRoutine(selected.id, {
                        exerciseId: e.id,
                        name: e.name,
                        sets: e.defaultSets,
                        target: e.defaultReps,
                        variantId: defaultVariantId(e),
                      })
                    }
                    className="flex items-center justify-between border border-[var(--rule2)] px-3 py-2 text-left hover:border-[var(--fg)]"
                  >
                    <span className="text-[13px] text-[var(--fg)]">{name(e.id)}</span>
                    <Plus className="size-3.5" style={{ color: WARN }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* RIGHT: exercise list */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-none items-center justify-between border-b border-[var(--rule2)] px-6 py-3">
            <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--faint)]">
              {t.routine.exercises} · {routine.length}
            </span>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
              style={{ borderColor: "var(--acc)", color: adding ? "var(--on)" : "var(--acc)", background: adding ? "var(--acc)" : "transparent" }}
            >
              <Plus className="size-3.5" /> {t.routine.addExercise}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            {routine.length === 0 && !adding && (
              <p className="py-6 text-center text-[13px] text-[var(--faint)]">{t.routine.emptyList}</p>
            )}

            {routine.map((r) => {
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
                      <span className="truncate text-[17px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
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
            })}

            {/* add-exercise picker (in-pane, no extra page scroll) */}
            {adding && (
              <div className="mt-4 border border-[var(--rule2)] p-3.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--faint2)]" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.currentTarget.value)}
                      placeholder={t.routine.searchPlaceholder}
                      className={`${input} h-9 w-full pr-3 pl-9 font-mono text-[12px] tracking-[0.04em] placeholder:text-[var(--faint2)]`}
                    />
                  </div>
                  <button
                    onClick={() => setCreating((v) => !v)}
                    className="flex-none font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[var(--acc)]"
                  >
                    {creating ? t.routine.cancel : t.routine.createOwn}
                  </button>
                </div>

                {creating && <CreateExerciseForm onCreate={handleCreate} />}

                {MUSCLE_ORDER.map((m) => {
                  const group = available.filter((e) => e.muscle === m);
                  if (group.length === 0) return null;
                  return (
                    <div key={m} className="mt-3">
                      <div className="font-mono text-[10px] tracking-[0.14em] text-[var(--faint2)]">
                        {t.muscle[m].toUpperCase()}
                      </div>
                      <div className="mt-1.5 border-t border-[var(--rule)]">
                        {group.map((e) => (
                          <div key={e.id} className="flex items-center gap-3 border-b border-[var(--rule)] py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14px] font-semibold text-[var(--fg)]">{name(e.id)}</div>
                              <div className="font-mono text-[10px] text-[var(--faint2)]">{e.defaultReps}</div>
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
                              className="flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
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
                  <p className="mt-3 text-[13px] text-[var(--faint)]">
                    {search ? `${t.routine.noResultsPre}"${search}".` : t.routine.noneLeft}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CreateExerciseForm({
  onCreate,
}: {
  onCreate: (i: {
    name: string;
    muscle: MuscleGroup;
    equipment: EquipmentId[];
    measure: Measure;
    context: ExerciseContext;
    defaultReps: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup>("push");
  const [measure, setMeasure] = useState<Measure>("reps");
  const [reps, setReps] = useState("8");
  const [equipment, setEquipment] = useState<EquipmentId[]>([]);
  const [context, setContext] = useState<ExerciseContext>("space");
  const { allEquipment, eqName } = useCatalog();
  const t = useT();

  const toggleEq = (id: EquipmentId) =>
    setEquipment((eq) => (eq.includes(id) ? eq.filter((e) => e !== id) : [...eq, id]));

  return (
    <div className="mt-3 flex flex-col gap-3 border border-[var(--rule2)] p-3.5">
      <input
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        placeholder={t.routine.exerciseNamePlaceholder}
        className={`${input} h-9 px-2.5 text-[14px] placeholder:text-[var(--faint2)]`}
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          value={muscle}
          onChange={(e) => setMuscle(e.currentTarget.value as MuscleGroup)}
          className={`${input} h-9 appearance-none px-2 font-mono text-[11.5px]`}
          aria-label={t.routine.muscleAria}
        >
          {MUSCLE_ORDER.map((m) => (
            <option key={m} value={m} className="bg-[var(--ink2)]">
              {t.muscle[m]}
            </option>
          ))}
        </select>
        <select
          value={measure}
          onChange={(e) => setMeasure(e.currentTarget.value as Measure)}
          className={`${input} h-9 appearance-none px-2 font-mono text-[11.5px]`}
          aria-label={t.routine.measureAria}
        >
          <option value="reps" className="bg-[var(--ink2)]">{t.routine.measureReps}</option>
          <option value="hold" className="bg-[var(--ink2)]">{t.routine.measureHold}</option>
        </select>
        <input
          value={reps}
          onChange={(e) => setReps(e.currentTarget.value)}
          placeholder={measure === "hold" ? "20s" : "8"}
          className={`${input} h-9 px-2 text-center font-mono text-[12px]`}
          aria-label={t.routine.repsOrDurationAria}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allEquipment.map((eq) => {
          const on = equipment.includes(eq.id);
          return (
            <button
              key={eq.id}
              onClick={() => toggleEq(eq.id)}
              className="border px-2.5 py-1 font-mono text-[10.5px] tracking-[0.04em]"
              style={{ borderColor: on ? "var(--acc)" : "var(--rule2)", color: on ? "var(--acc)" : "var(--faint)" }}
            >
              {eqName(eq.id).toUpperCase()}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {(["space", "desk"] as ExerciseContext[]).map((c) => {
          const on = context === c;
          return (
            <button
              key={c}
              onClick={() => setContext(c)}
              className="flex-1 border px-2.5 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.04em]"
              style={{ borderColor: on ? "var(--acc)" : "var(--rule2)", color: on ? "var(--acc)" : "var(--faint)" }}
            >
              {t.context[c].toUpperCase()}
            </button>
          );
        })}
      </div>
      <button
        disabled={!name.trim()}
        onClick={() =>
          onCreate({
            name: name.trim(),
            muscle,
            equipment,
            measure,
            context,
            defaultReps: reps.trim() || (measure === "hold" ? "20s" : "8"),
          })
        }
        className="bg-[var(--acc)] px-4 py-2.5 font-mono text-[12px] font-semibold tracking-[0.06em] text-[var(--on)] disabled:opacity-40"
      >
        {t.routine.createAndAdd}
      </button>
    </div>
  );
}
