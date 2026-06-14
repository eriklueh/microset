import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EQUIPMENT } from "@/domain/seed";
import { useStore } from "@/store/useStore";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const toggle = useStore((s) => s.toggleEquipment);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        Lo que tenés determina qué ejercicios podés sumar a la rutina.
      </p>
      {EQUIPMENT.map((eq) => (
        <div
          key={eq.id}
          className="bg-card flex items-center justify-between rounded-xl border p-3"
        >
          <Label htmlFor={eq.id} className="cursor-pointer">
            {eq.name}
          </Label>
          <Switch
            id={eq.id}
            checked={owned.includes(eq.id)}
            onCheckedChange={() => toggle(eq.id)}
          />
        </div>
      ))}
    </div>
  );
}
