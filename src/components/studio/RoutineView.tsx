import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXERCISES, exerciseById, isAvailable } from "@/domain/seed";
import { MUSCLE_LABEL } from "@/domain/types";
import { useStore } from "@/store/useStore";

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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tu rutina diaria</h2>
          <span className="text-muted-foreground text-sm">
            {totalSets} series/día
          </span>
        </div>

        {routine.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Agregá ejercicios desde la lista de abajo.
          </p>
        )}

        {routine.map((r) => {
          const ex = exerciseById(r.exerciseId);
          return (
            <div
              key={r.exerciseId}
              className="bg-card flex items-center gap-3 rounded-xl border p-3"
            >
              <div className="flex-1">
                <div className="font-medium">{r.name}</div>
                {ex && (
                  <div className="text-muted-foreground text-xs">
                    {MUSCLE_LABEL[ex.muscle]} · {ex.defaultReps}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setRoutineSets(r.exerciseId, r.sets - 1)}
                  aria-label="Menos series"
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-9 text-center text-sm tabular-nums">
                  {r.sets}×
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setRoutineSets(r.exerciseId, r.sets + 1)}
                  aria-label="Más series"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => removeFromRoutine(r.exerciseId)}
                aria-label="Quitar"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </section>

      {available.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Agregar ejercicio</h2>
          {available.map((e) => (
            <div
              key={e.id}
              className="bg-card flex items-center gap-3 rounded-xl border p-3"
            >
              <div className="flex-1">
                <div className="font-medium">{e.name}</div>
                <div className="text-muted-foreground text-xs">
                  {MUSCLE_LABEL[e.muscle]} · {e.defaultReps}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  addToRoutine({
                    exerciseId: e.id,
                    name: e.name,
                    sets: e.defaultSets,
                  })
                }
              >
                <Plus className="size-4" /> Agregar
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
