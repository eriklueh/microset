import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/store/useStore";

const toHour = (min: number) => Math.round(min / 60);

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const lunch = settings.avoidWindows[0];

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <h2 className="font-semibold">Horario laboral</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Inicio (h)"
            value={toHour(settings.workWindow.start)}
            min={0}
            max={23}
            onChange={(h) =>
              setSettings({
                workWindow: { ...settings.workWindow, start: h * 60 },
              })
            }
          />
          <Field
            label="Fin (h)"
            value={toHour(settings.workWindow.end)}
            min={1}
            max={24}
            onChange={(h) =>
              setSettings({
                workWindow: { ...settings.workWindow, end: h * 60 },
              })
            }
          />
        </div>
      </section>

      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <h2 className="font-semibold">Almuerzo</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Desde (h)"
            value={lunch ? toHour(lunch.start) : 13}
            min={0}
            max={23}
            onChange={(h) =>
              setSettings({
                avoidWindows: [{ start: h * 60, end: lunch?.end ?? 14 * 60 }],
              })
            }
          />
          <Field
            label="Hasta (h)"
            value={lunch ? toHour(lunch.end) : 14}
            min={1}
            max={24}
            onChange={(h) =>
              setSettings({
                avoidWindows: [{ start: lunch?.start ?? 13 * 60, end: h * 60 }],
              })
            }
          />
        </div>
      </section>

      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <h2 className="font-semibold">Descanso mínimo</h2>
        <Field
          label="Minutos entre series"
          value={settings.minRest}
          min={5}
          max={180}
          step={5}
          onChange={(m) => setSettings({ minRest: m })}
        />
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </div>
  );
}
