import { useState } from "react";
import { AlertTriangle, Minus, Plus, Search, Trash2 } from "lucide-react";
import { analyzeRoutine } from "@/coach/analysis";
import { defaultVariantId, exerciseContext, isAvailable } from "@/domain/seed";
import { METHODOLOGIES, methodologyById } from "@/domain/methodologies";
import {
  CONTEXT_LABEL,
  MUSCLE_LABEL,
  type EquipmentId,
  type ExerciseContext,
  type Measure,
  type MuscleGroup,
} from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useStore } from "@/store/useStore";
import { Masthead } from "./Masthead";

const hh = (min: number) => `${Math.round(min / 60)}H`;
const DOW = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MUSCLE_ORDER: MuscleGroup[] = ["pull", "push", "core", "legs"];
const WARN = "#e0a400";
const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  pull: "oklch(0.70 0.14 235)",
  push: "oklch(0.80 0.15 75)",
  core: "oklch(0.66 0.18 295)",
  legs: "oklch(0.78 0.18 142)",
};
const input = "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";
const stepBtn =
  "grid size-8 place-items-center border border-[var(--rule2)] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]";

export function RoutineView() {
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

  const { all, byId } = useCatalog();
  const [selectedId, setSelectedId] = useState(dayTypes[0].id);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = dayTypes.find((d) => d.id === selectedId) ?? dayTypes[0];
  const routine = selected.routine;
  const method = methodologyById(methodologyId) ?? METHODOLOGIES[0];
  const usedDays = DOW.filter((_, i) => week[i] === selected.id);

  const inRoutine = new Set(routine.map((r) => r.exerciseId));
  const available = all.filter(
    (e) =>
      isAvailable(e, owned) &&
      !inRoutine.has(e.id) &&
      e.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const { totalSets, fits, allFit, balance } = analyzeRoutine(routine, owned, settings, byId);

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
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="RUTINA" sub="ARMÁ CADA TIPO DE DÍA" />

      {/* Day-type picker */}
      <div className="flex flex-wrap items-center gap-2">
        {dayTypes.map((dt) => {
          const on = selected.id === dt.id;
          return (
            <button
              key={dt.id}
              onClick={() => setSelectedId(dt.id)}
              className="border px-3.5 py-2 font-mono text-[11.5px] font-semibold tracking-[0.06em]"
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
          onClick={() => setSelectedId(addDayType("Nuevo"))}
          className="flex items-center gap-1 border border-[var(--rule2)] px-3 py-2 font-mono text-[11.5px] font-semibold tracking-[0.06em] text-[var(--faint)] hover:text-[var(--fg)]"
        >
          <Plus className="size-3.5" /> TIPO
        </button>
      </div>

      {/* Day-type name + usage */}
      <div className="mt-4 flex items-center gap-3 border border-[var(--rule2)] px-3.5 py-3">
        <input
          value={selected.name}
          onChange={(e) => renameDayType(selected.id, e.currentTarget.value)}
          aria-label="Nombre del tipo de día"
          className="min-w-0 flex-1 bg-transparent text-[18px] font-bold tracking-[-0.01em] text-[var(--fg)] outline-none"
        />
        <span className="flex-none font-mono text-[10.5px] tracking-[0.08em] text-[var(--faint)]">
          {usedDays.length > 0 ? usedDays.join(" ") : "SIN ASIGNAR"}
        </span>
        <button
          disabled={dayTypes.length <= 1}
          onClick={() => removeDayType(selected.id)}
          aria-label="Eliminar tipo de día"
          className="flex-none text-[var(--faint2)] hover:text-[var(--destructive)] disabled:opacity-30"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Methodology */}
      <div className="mt-3 border border-[var(--rule2)] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
            METODOLOGÍA
          </span>
          <select
            value={methodologyId}
            onChange={(e) => applyMethodology(selected.id, e.currentTarget.value)}
            aria-label="Metodología"
            className={`${input} appearance-none px-2.5 py-1.5 font-mono text-[11.5px]`}
          >
            {METHODOLOGIES.map((m) => (
              <option key={m.id} value={m.id} className="bg-[var(--ink2)]">
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-[14px] font-semibold text-[var(--fg)]">{method.tagline}</p>
        <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--faint)]">{method.description}</p>
      </div>

      {/* Summary */}
      <div className="mt-3 border border-[var(--rule2)] p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
            RESUMEN DEL DÍA
          </span>
          <span className="font-mono text-[20px] font-semibold text-[var(--fg)]">
            {totalSets}
            <span className="text-[12px] text-[var(--faint2)]"> SERIES</span>
          </span>
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.5]" style={{ color: allFit ? "var(--faint)" : WARN }}>
          {totalSets === 0
            ? "Agregá ejercicios para empezar."
            : allFit
              ? `Entran las ${totalSets} series en tu horario (${hh(settings.workWindow.start)}–${hh(settings.workWindow.end)}).`
              : `Solo entran ${fits} de ${totalSets} series. Recortá volumen o ampliá tu horario.`}
        </p>
        {totalSets > 0 && <Balance balance={balance} total={totalSets} />}
      </div>

      {/* Exercises */}
      <div className="mt-6 font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
        EJERCICIOS
      </div>
      <div className="mt-2.5 border-t border-[var(--rule)]">
        {routine.length === 0 && (
          <p className="py-4 text-[13px] text-[var(--faint)]">Agregá ejercicios desde abajo.</p>
        )}
        {routine.map((r) => {
          const ex = byId(r.exerciseId);
          const orphan = ex ? !isAvailable(ex, owned) : false;
          return (
            <div
              key={r.exerciseId}
              className="border-b border-[var(--rule)] py-3"
              style={{ opacity: orphan ? 0.55 : 1 }}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[19px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
                      {r.name}
                    </span>
                    {orphan && (
                      <AlertTriangle
                        className="size-3.5 shrink-0"
                        style={{ color: WARN }}
                        aria-label="Te falta el equipo para este ejercicio"
                      />
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] tracking-[0.08em] text-[var(--faint2)]">
                    {ex ? MUSCLE_LABEL[ex.muscle].toUpperCase() : ""}
                    {ex && exerciseContext(ex) === "desk" ? " · ESCRITORIO" : ""}
                    {orphan ? " · FALTA EQUIPO" : ""}
                  </div>
                </div>

                <input
                  value={r.target ?? ex?.defaultReps ?? ""}
                  onChange={(e) => setRoutineTarget(selected.id, r.exerciseId, e.currentTarget.value)}
                  aria-label="Reps o duración"
                  className={`${input} h-8 w-16 text-center font-mono text-[12px]`}
                />

                <div className="flex items-center">
                  <button
                    onClick={() => setRoutineSets(selected.id, r.exerciseId, r.sets - 1)}
                    aria-label="Menos series"
                    className={stepBtn}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="grid h-8 w-10 place-items-center border-y border-[var(--rule2)] font-mono text-[13px] font-semibold text-[var(--fg)]">
                    {r.sets}×
                  </span>
                  <button
                    onClick={() => setRoutineSets(selected.id, r.exerciseId, r.sets + 1)}
                    aria-label="Más series"
                    className={stepBtn}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => removeFromRoutine(selected.id, r.exerciseId)}
                  aria-label="Quitar"
                  className="text-[var(--faint2)] hover:text-[var(--destructive)]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {ex && ex.axis.length > 1 && (
                <div className="mt-2.5 flex items-center gap-2.5">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--faint2)]">
                    NIVEL
                  </span>
                  <select
                    value={r.variantId ?? defaultVariantId(ex)}
                    onChange={(e) => setRoutineVariant(selected.id, r.exerciseId, e.currentTarget.value)}
                    aria-label="Nivel de intensidad"
                    className={`${input} h-8 flex-1 appearance-none px-2.5 font-mono text-[11.5px]`}
                  >
                    {ex.axis.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[var(--ink2)]">
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Catalog */}
      <div className="mt-6 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
          AGREGAR EJERCICIO
        </span>
        <button
          onClick={() => setCreating((v) => !v)}
          className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[var(--acc)]"
        >
          {creating ? "CANCELAR" : "CREAR PROPIO"}
        </button>
      </div>

      {creating && <CreateExerciseForm onCreate={handleCreate} />}

      <div className="relative mt-2.5">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--faint2)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="BUSCAR EJERCICIO…"
          className={`${input} h-9 w-full pr-3 pl-9 font-mono text-[12px] tracking-[0.04em] placeholder:text-[var(--faint2)]`}
        />
      </div>

      {MUSCLE_ORDER.map((m) => {
        const group = available.filter((e) => e.muscle === m);
        if (group.length === 0) return null;
        return (
          <div key={m} className="mt-3">
            <div className="font-mono text-[10px] tracking-[0.14em] text-[var(--faint2)]">
              {MUSCLE_LABEL[m].toUpperCase()}
            </div>
            <div className="mt-1.5 border-t border-[var(--rule)]">
              {group.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 border-b border-[var(--rule)] py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-[var(--fg)]">{e.name}</div>
                    <div className="font-mono text-[10.5px] text-[var(--faint2)]">{e.defaultReps}</div>
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
                    <Plus className="size-3.5" /> AGREGAR
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {available.length === 0 && (
        <p className="mt-3 text-[13px] text-[var(--faint)]">
          {search ? `No hay ejercicios para "${search}".` : "No quedan ejercicios para agregar."}
        </p>
      )}
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
  const { allEquipment } = useCatalog();

  const toggleEq = (id: EquipmentId) =>
    setEquipment((eq) => (eq.includes(id) ? eq.filter((e) => e !== id) : [...eq, id]));

  return (
    <div className="mt-2.5 flex flex-col gap-3 border border-[var(--rule2)] p-3.5">
      <input
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        placeholder="NOMBRE DEL EJERCICIO"
        className={`${input} h-9 px-2.5 text-[14px] placeholder:text-[var(--faint2)]`}
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          value={muscle}
          onChange={(e) => setMuscle(e.currentTarget.value as MuscleGroup)}
          className={`${input} h-9 appearance-none px-2 font-mono text-[11.5px]`}
          aria-label="Músculo"
        >
          {MUSCLE_ORDER.map((m) => (
            <option key={m} value={m} className="bg-[var(--ink2)]">
              {MUSCLE_LABEL[m]}
            </option>
          ))}
        </select>
        <select
          value={measure}
          onChange={(e) => setMeasure(e.currentTarget.value as Measure)}
          className={`${input} h-9 appearance-none px-2 font-mono text-[11.5px]`}
          aria-label="Medida"
        >
          <option value="reps" className="bg-[var(--ink2)]">Reps</option>
          <option value="hold" className="bg-[var(--ink2)]">Aguante</option>
        </select>
        <input
          value={reps}
          onChange={(e) => setReps(e.currentTarget.value)}
          placeholder={measure === "hold" ? "20s" : "8"}
          className={`${input} h-9 px-2 text-center font-mono text-[12px]`}
          aria-label="Reps o duración"
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
              style={{
                borderColor: on ? "var(--acc)" : "var(--rule2)",
                color: on ? "var(--acc)" : "var(--faint)",
              }}
            >
              {eq.name.toUpperCase()}
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
              style={{
                borderColor: on ? "var(--acc)" : "var(--rule2)",
                color: on ? "var(--acc)" : "var(--faint)",
              }}
            >
              {CONTEXT_LABEL[c].toUpperCase()}
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
        CREAR Y AGREGAR
      </button>
    </div>
  );
}

function Balance({ balance, total }: { balance: Record<MuscleGroup, number>; total: number }) {
  return (
    <div className="mt-3">
      <div className="flex h-[6px] gap-px">
        {MUSCLE_ORDER.map((m) =>
          balance[m] > 0 ? (
            <div key={m} style={{ width: `${(balance[m] / total) * 100}%`, background: MUSCLE_COLOR[m] }} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
        {MUSCLE_ORDER.filter((m) => balance[m] > 0).map((m) => (
          <span
            key={m}
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-[var(--faint)]"
          >
            <span className="size-2" style={{ background: MUSCLE_COLOR[m] }} />
            {MUSCLE_LABEL[m].toUpperCase()} · {balance[m]}
          </span>
        ))}
      </div>
    </div>
  );
}
