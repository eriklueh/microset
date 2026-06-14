import { Switch } from "@/components/ui/switch";
import { EQUIPMENT, EXERCISES, exerciseById } from "@/domain/seed";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const routine = useStore((s) => s.routine);
  const toggle = useStore((s) => s.toggleEquipment);

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <p className="text-muted-foreground px-1 pb-1 text-xs">
        Lo que tenés define qué ejercicios podés sumar a la rutina.
      </p>
      {EQUIPMENT.map((eq) => {
        const enables = EXERCISES.filter((e) => e.equipment.includes(eq.id)).length;
        const used = routine.filter((r) =>
          exerciseById(r.exerciseId)?.equipment.includes(eq.id),
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
                {used > 0 ? ` · ${used} en tu rutina` : ""}
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
