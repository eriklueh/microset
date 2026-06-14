import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXERCISES, exerciseById, isAvailable } from "@/domain/seed";
import { MUSCLE_LABEL } from "@/domain/types";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

export function RoutineView() {
  const routine = useStore((s) => s.routine);
  const owned = useStore((s) => s.ownedEquipment);
  const setRoutineSets = useStore((s) => s.setRoutineSets);
  const removeFromRoutine = useStore((s) => s.removeFromRoutine);
  const addToRoutine = useStore((s) => s.addToRoutine);

  const inRoutine = new Set(routine.map((r) => r.exerciseId));
  const totalSets = routine.reduce((n, r) => n + r.sets, 0);
  const available = EXERCISES.filter(
    (e) => isAvailable(e, owned) && !inRoutine.has(e.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Rutina diaria
          </span>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {totalSets} series/día
          </span>
        </div>

        {routine.length === 0 && (
          <p className="text-muted-foreground px-1 text-sm">
            Agregá ejercicios desde la lista de abajo.
          </p>
        )}

        {routine.map((r) => {
          const ex = exerciseById(r.exerciseId);
          return (
            <div key={r.exerciseId} className={`${CARD} flex items-center gap-3 p-2.5 pl-3`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                {ex && (
                  <div className="text-muted-foreground text-xs">
                    {MUSCLE_LABEL[ex.muscle]} · {ex.defaultReps}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <Button size="icon-xs" variant="ghost" onClick={() => setRoutineSets(r.exerciseId, r.sets - 1)} aria-label="Menos series">
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center font-mono text-sm tabular-nums">{r.sets}×</span>
                <Button size="icon-xs" variant="ghost" onClick={() => setRoutineSets(r.exerciseId, r.sets + 1)} aria-label="Más series">
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
                onClick={() => addToRoutine({ exerciseId: e.id, name: e.name, sets: e.defaultSets })}
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
