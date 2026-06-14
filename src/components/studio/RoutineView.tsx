import { useState } from "react";
import { AlertTriangle, Minus, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDayPlan } from "@/lib/engine";
import { EQUIPMENT, defaultVariantId, isAvailable } from "@/domain/seed";
import { METHODOLOGIES, methodologyById } from "@/domain/methodologies";
import {
  MUSCLE_LABEL,
  type EquipmentId,
  type Measure,
  type MuscleGroup,
} from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";
const hh = (min: number) => `${Math.round(min / 60)}h`;
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MUSCLE_ORDER: MuscleGroup[] = ["pull", "push", "core", "legs"];

const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  pull: "oklch(0.70 0.14 235)",
  push: "oklch(0.80 0.15 75)",
  core: "oklch(0.66 0.18 295)",
  legs: "oklch(0.78 0.18 142)",
};

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

  const doable = routine.filter((r) => {
    const ex = byId(r.exerciseId);
    return ex ? isAvailable(ex, owned) : true;
  });
  const totalSets = doable.reduce((n, r) => n + r.sets, 0);
  const plan = createDayPlan(doable, settings, settings.workWindow.start);
  const fits = plan.blocks.filter((b) => b.time >= 0).length;
  const allFit = fits >= totalSets;

  const balance: Record<MuscleGroup, number> = { pull: 0, push: 0, core: 0, legs: 0 };
  for (const r of doable) {
    const ex = byId(r.exerciseId);
    if (ex) balance[ex.muscle] += r.sets;
  }

  const handleCreate = (input: {
    name: string;
    muscle: MuscleGroup;
    equipment: EquipmentId[];
    measure: Measure;
    defaultReps: string;
  }) => {
    const ex = addCustomExercise(input);
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
    <div className="flex max-w-2xl flex-col gap-4">
      {/* Day-type picker */}
      <div className="flex flex-wrap items-center gap-1.5">
        {dayTypes.map((dt) => (
          <button
            key={dt.id}
            onClick={() => setSelectedId(dt.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selected.id === dt.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {dt.name}
          </button>
        ))}
        <button
          onClick={() => setSelectedId(addDayType("Nuevo"))}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium"
        >
          <Plus className="size-3.5" /> Tipo de día
        </button>
      </div>

      <div className={`${CARD} flex flex-col gap-2 p-3`}>
        <div className="flex items-center gap-2">
          <input
            value={selected.name}
            onChange={(e) => renameDayType(selected.id, e.currentTarget.value)}
            aria-label="Nombre del tipo de día"
            className="focus:border-ring focus:bg-background/40 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-medium outline-none"
          />
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={dayTypes.length <= 1}
            onClick={() => removeDayType(selected.id)}
            aria-label="Eliminar tipo de día"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <div className="text-muted-foreground text-xs">
          {usedDays.length > 0
            ? `Usado: ${usedDays.join(", ")}`
            : "Sin asignar a ningún día — andá a Semana."}
        </div>
      </div>

      {/* Methodology */}
      <div className={`${CARD} flex flex-col gap-2 p-4`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Metodología
          </span>
          <select
            value={methodologyId}
            onChange={(e) => applyMethodology(selected.id, e.currentTarget.value)}
            aria-label="Metodología"
            className="border-input bg-background/40 text-foreground focus:border-ring h-7 rounded-md border px-2 text-xs outline-none"
          >
            {METHODOLOGIES.map((m) => (
              <option key={m.id} value={m.id} className="bg-popover text-popover-foreground">
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm font-medium">{method.tagline}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{method.description}</p>
      </div>

      {/* Summary */}
      <div className={`${CARD} flex flex-col gap-3 p-4`}>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Resumen del día
          </span>
          <span className="font-mono text-xs tabular-nums">{totalSets} series</span>
        </div>
        <p className={`text-xs ${allFit ? "text-muted-foreground" : "text-amber-500"}`}>
          {totalSets === 0
            ? "Agregá ejercicios para empezar."
            : allFit
              ? `Entran las ${totalSets} series en tu horario (${hh(settings.workWindow.start)}–${hh(settings.workWindow.end)}).`
              : `Solo entran ${fits} de ${totalSets} series. Recortá volumen o ampliá tu horario.`}
        </p>
        {totalSets > 0 && <Balance balance={balance} total={totalSets} />}
      </div>

      {/* Exercises */}
      <section className="flex flex-col gap-2">
        <span className="text-muted-foreground px-1 text-[11px] font-medium tracking-wider uppercase">
          Ejercicios
        </span>
        {routine.length === 0 && (
          <p className="text-muted-foreground px-1 text-sm">Agregá ejercicios desde abajo.</p>
        )}
        {routine.map((r) => {
          const ex = byId(r.exerciseId);
          const orphan = ex ? !isAvailable(ex, owned) : false;
          return (
            <div
              key={r.exerciseId}
              className={`${CARD} flex flex-col gap-2.5 p-3 ${orphan ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {orphan && (
                      <AlertTriangle
                        className="size-3.5 shrink-0 text-amber-500"
                        aria-label="Te falta el equipo para este ejercicio"
                      />
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {ex ? MUSCLE_LABEL[ex.muscle] : ""}
                    {orphan ? " · te falta equipo" : ""}
                  </div>
                </div>

                <input
                  value={r.target ?? ex?.defaultReps ?? ""}
                  onChange={(e) => setRoutineTarget(selected.id, r.exerciseId, e.currentTarget.value)}
                  aria-label="Reps o duración"
                  className="border-input bg-background/40 focus:border-ring h-7 w-16 rounded-md border text-center font-mono text-xs outline-none"
                />

                <div className="flex items-center gap-0.5">
                  <Button size="icon-xs" variant="ghost" onClick={() => setRoutineSets(selected.id, r.exerciseId, r.sets - 1)} aria-label="Menos series">
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-8 text-center font-mono text-sm tabular-nums">{r.sets}×</span>
                  <Button size="icon-xs" variant="ghost" onClick={() => setRoutineSets(selected.id, r.exerciseId, r.sets + 1)} aria-label="Más series">
                    <Plus className="size-3.5" />
                  </Button>
                </div>

                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeFromRoutine(selected.id, r.exerciseId)}
                  aria-label="Quitar"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              {ex && ex.axis.length > 1 && (
                <div className="flex items-center gap-2 border-t pt-2.5">
                  <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    Nivel
                  </span>
                  <select
                    value={r.variantId ?? defaultVariantId(ex)}
                    onChange={(e) => setRoutineVariant(selected.id, r.exerciseId, e.currentTarget.value)}
                    aria-label="Nivel de intensidad"
                    className="border-input bg-background/40 text-foreground focus:border-ring h-7 flex-1 rounded-md border px-2 text-xs outline-none"
                  >
                    {ex.axis.map((v) => (
                      <option key={v.id} value={v.id} className="bg-popover text-popover-foreground">
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Catalog */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Agregar ejercicio
          </span>
          <button
            onClick={() => setCreating((v) => !v)}
            className="text-primary text-xs font-medium"
          >
            {creating ? "Cancelar" : "Crear propio"}
          </button>
        </div>

        {creating && <CreateExerciseForm onCreate={handleCreate} />}

        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Buscar ejercicio…"
            className="border-input bg-background/40 focus:border-ring h-8 w-full rounded-md border pr-3 pl-8 text-sm outline-none"
          />
        </div>

        {MUSCLE_ORDER.map((m) => {
          const group = available.filter((e) => e.muscle === m);
          if (group.length === 0) return null;
          return (
            <div key={m} className="flex flex-col gap-1.5">
              <span className="text-muted-foreground px-1 pt-1 text-[10px] font-medium tracking-wider uppercase">
                {MUSCLE_LABEL[m]}
              </span>
              {group.map((e) => (
                <div key={e.id} className={`${CARD} flex items-center gap-3 p-2.5 pl-3`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <div className="text-muted-foreground text-xs">{e.defaultReps}</div>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      addToRoutine(selected.id, {
                        exerciseId: e.id,
                        name: e.name,
                        sets: e.defaultSets,
                        target: e.defaultReps,
                        variantId: defaultVariantId(e),
                      })
                    }
                  >
                    <Plus className="size-3.5" /> Agregar
                  </Button>
                </div>
              ))}
            </div>
          );
        })}

        {available.length === 0 && (
          <p className="text-muted-foreground px-1 text-sm">
            {search ? `No hay ejercicios para "${search}".` : "No quedan ejercicios para agregar."}
          </p>
        )}
      </section>
    </div>
  );
}

function CreateExerciseForm({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    muscle: MuscleGroup;
    equipment: EquipmentId[];
    measure: Measure;
    defaultReps: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup>("push");
  const [measure, setMeasure] = useState<Measure>("reps");
  const [reps, setReps] = useState("8");
  const [equipment, setEquipment] = useState<EquipmentId[]>([]);

  const toggleEq = (id: EquipmentId) =>
    setEquipment((eq) => (eq.includes(id) ? eq.filter((e) => e !== id) : [...eq, id]));

  const inputCls =
    "border-input bg-background/40 focus:border-ring h-8 w-full rounded-md border px-2 text-sm outline-none";

  return (
    <div className={`${CARD} flex flex-col gap-3 p-3`}>
      <input
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        placeholder="Nombre del ejercicio"
        className={inputCls}
      />
      <div className="grid grid-cols-3 gap-2">
        <select value={muscle} onChange={(e) => setMuscle(e.currentTarget.value as MuscleGroup)} className={inputCls} aria-label="Músculo">
          {MUSCLE_ORDER.map((m) => (
            <option key={m} value={m} className="bg-popover text-popover-foreground">
              {MUSCLE_LABEL[m]}
            </option>
          ))}
        </select>
        <select value={measure} onChange={(e) => setMeasure(e.currentTarget.value as Measure)} className={inputCls} aria-label="Medida">
          <option value="reps" className="bg-popover text-popover-foreground">Reps</option>
          <option value="hold" className="bg-popover text-popover-foreground">Aguante</option>
        </select>
        <input value={reps} onChange={(e) => setReps(e.currentTarget.value)} placeholder={measure === "hold" ? "20s" : "8"} className={`${inputCls} font-mono`} aria-label="Reps o duración" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EQUIPMENT.map((eq) => (
          <button
            key={eq.id}
            onClick={() => toggleEq(eq.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              equipment.includes(eq.id)
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {eq.name}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        disabled={!name.trim()}
        onClick={() =>
          onCreate({
            name: name.trim(),
            muscle,
            equipment,
            measure,
            defaultReps: reps.trim() || (measure === "hold" ? "20s" : "8"),
          })
        }
      >
        Crear y agregar
      </Button>
    </div>
  );
}

function Balance({
  balance,
  total,
}: {
  balance: Record<MuscleGroup, number>;
  total: number;
}) {
  const order: MuscleGroup[] = ["pull", "push", "core", "legs"];
  return (
    <div>
      <div className="bg-muted/60 flex h-2 overflow-hidden rounded-full">
        {order.map((m) =>
          balance[m] > 0 ? (
            <div
              key={m}
              style={{ width: `${(balance[m] / total) * 100}%`, background: MUSCLE_COLOR[m] }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {order
          .filter((m) => balance[m] > 0)
          .map((m) => (
            <span key={m} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <span className="size-2 rounded-full" style={{ background: MUSCLE_COLOR[m] }} />
              {MUSCLE_LABEL[m]} · {balance[m]}
            </span>
          ))}
      </div>
    </div>
  );
}
