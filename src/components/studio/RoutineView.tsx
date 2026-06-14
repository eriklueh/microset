import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDayPlan } from "@/lib/engine";
import { EXERCISES, exerciseById, isAvailable } from "@/domain/seed";
import { MUSCLE_LABEL, type MuscleGroup } from "@/domain/types";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";
const hh = (min: number) => `${Math.round(min / 60)}h`;

const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  pull: "oklch(0.70 0.14 235)",
  push: "oklch(0.80 0.15 75)",
  core: "oklch(0.66 0.18 295)",
  legs: "oklch(0.78 0.18 142)",
};

export function RoutineView() {
  const routine = useStore((s) => s.routine);
  const owned = useStore((s) => s.ownedEquipment);
  const settings = useStore((s) => s.settings);
  const setRoutineSets = useStore((s) => s.setRoutineSets);
  const setRoutineTarget = useStore((s) => s.setRoutineTarget);
  const removeFromRoutine = useStore((s) => s.removeFromRoutine);
  const addToRoutine = useStore((s) => s.addToRoutine);

  const inRoutine = new Set(routine.map((r) => r.exerciseId));
  const available = EXERCISES.filter((e) => isAvailable(e, owned) && !inRoutine.has(e.id));

  // Feasibility from the start of the work window (stable, time-independent).
  const doable = routine.filter((r) => {
    const ex = exerciseById(r.exerciseId);
    return ex ? isAvailable(ex, owned) : true;
  });
  const totalSets = doable.reduce((n, r) => n + r.sets, 0);
  const plan = createDayPlan(doable, settings, settings.workWindow.start);
  const fits = plan.blocks.filter((b) => b.time >= 0).length;
  const allFit = fits >= totalSets;

  const balance: Record<MuscleGroup, number> = { pull: 0, push: 0, core: 0, legs: 0 };
  for (const r of doable) {
    const ex = exerciseById(r.exerciseId);
    if (ex) balance[ex.muscle] += r.sets;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
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

      <section className="flex flex-col gap-2">
        <span className="text-muted-foreground px-1 text-[11px] font-medium tracking-wider uppercase">
          Ejercicios
        </span>
        {routine.length === 0 && (
          <p className="text-muted-foreground px-1 text-sm">Agregá ejercicios desde abajo.</p>
        )}
        {routine.map((r) => {
          const ex = exerciseById(r.exerciseId);
          const orphan = ex ? !isAvailable(ex, owned) : false;
          return (
            <div
              key={r.exerciseId}
              className={`${CARD} flex items-center gap-3 p-2.5 pl-3 ${orphan ? "opacity-60" : ""}`}
            >
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
                onChange={(e) => setRoutineTarget(r.exerciseId, e.currentTarget.value)}
                aria-label="Reps o duración"
                className="border-input bg-background/40 focus:border-ring h-7 w-16 rounded-md border text-center font-mono text-xs outline-none"
              />

              <div className="flex items-center gap-0.5">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setRoutineSets(r.exerciseId, r.sets - 1)}
                  aria-label="Menos series"
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center font-mono text-sm tabular-nums">{r.sets}×</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setRoutineSets(r.exerciseId, r.sets + 1)}
                  aria-label="Más series"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

              <Button
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeFromRoutine(r.exerciseId)}
                aria-label="Quitar"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </section>

      {available.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="text-muted-foreground px-1 text-[11px] font-medium tracking-wider uppercase">
            Agregar ejercicio
          </span>
          {available.map((e) => (
            <div key={e.id} className={`${CARD} flex items-center gap-3 p-2.5 pl-3`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.name}</div>
                <div className="text-muted-foreground text-xs">
                  {MUSCLE_LABEL[e.muscle]} · {e.defaultReps}
                </div>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  addToRoutine({
                    exerciseId: e.id,
                    name: e.name,
                    sets: e.defaultSets,
                    target: e.defaultReps,
                  })
                }
              >
                <Plus className="size-3.5" /> Agregar
              </Button>
            </div>
          ))}
        </section>
      )}
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
            <span
              key={m}
              className="text-muted-foreground flex items-center gap-1.5 text-[11px]"
            >
              <span className="size-2 rounded-full" style={{ background: MUSCLE_COLOR[m] }} />
              {MUSCLE_LABEL[m]} · {balance[m]}
            </span>
          ))}
      </div>
    </div>
  );
}
