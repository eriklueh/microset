import { Switch } from "@/components/ui/switch";
import { EQUIPMENT } from "@/domain/seed";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const toggle = useStore((s) => s.toggleEquipment);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground px-1 pb-1 text-xs">
        Lo que tenés define qué ejercicios podés sumar a la rutina.
      </p>
      {EQUIPMENT.map((eq) => (
        <label
          key={eq.id}
          htmlFor={eq.id}
          className={`${CARD} flex cursor-pointer items-center justify-between p-3`}
        >
          <span className="text-sm font-medium">{eq.name}</span>
          <Switch
            id={eq.id}
            checked={owned.includes(eq.id)}
            onCheckedChange={() => toggle(eq.id)}
          />
        </label>
      ))}
    </div>
  );
}
