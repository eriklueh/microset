import { Switch } from "@/components/ui/switch";
import { EQUIPMENT } from "@/domain/seed";
import { useCatalog } from "@/hooks/useCatalog";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const dayTypes = useStore((s) => s.dayTypes);
  const toggle = useStore((s) => s.toggleEquipment);
  const { all, byId } = useCatalog();

  const usedExercises = new Set(
    dayTypes.flatMap((d) => d.routine.map((r) => r.exerciseId)),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <p className="text-muted-foreground px-1 pb-1 text-xs">
        Decinos qué tenés en casa: define qué ejercicios podés sumar a tus rutinas.
      </p>
      {EQUIPMENT.map((eq) => {
        const enables = all.filter((e) => e.equipment.includes(eq.id)).length;
        const used = [...usedExercises].filter((id) =>
          byId(id)?.equipment.includes(eq.id),
        ).length;
        const isOwned = owned.includes(eq.id);
        const orphaning = !isOwned && used > 0;
        return (
          <label
            key={eq.id}
            htmlFor={eq.id}
            className={`${CARD} flex cursor-pointer items-center justify-between p-3`}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{eq.name}</div>
              <div className={`text-xs ${orphaning ? "text-amber-500" : "text-muted-foreground"}`}>
                {enables} ejercicios
                {used > 0 ? ` · ${used} en tus rutinas` : ""}
                {orphaning ? " — quedan sin hacer" : ""}
              </div>
            </div>
            <Switch id={eq.id} checked={isOwned} onCheckedChange={() => toggle(eq.id)} />
          </label>
        );
      })}
    </div>
  );
}
