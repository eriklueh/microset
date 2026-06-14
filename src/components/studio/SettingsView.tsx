import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCENTS, THEME_MODES } from "@/lib/theme";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";
const toHour = (min: number) => Math.round(min / 60);

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const theme = useStore((s) => s.theme);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const setAccent = useStore((s) => s.setAccent);
  const lunch = settings.avoidWindows[0];

  return (
    <div className="flex flex-col gap-3">
      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Apariencia
        </span>
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs">Tema</Label>
          <div className="bg-muted/50 flex gap-1 rounded-lg p-1">
            {THEME_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setThemeMode(m.id)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  theme.mode === m.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-muted-foreground mb-1.5 block text-xs">Acento</Label>
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a.id)}
                aria-label={a.label}
                title={a.label}
                className={`size-6 rounded-full border transition-transform hover:scale-110 ${
                  theme.accent === a.id
                    ? "ring-ring ring-offset-background ring-2 ring-offset-2"
                    : "border-border"
                }`}
                style={{ background: a.swatch }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Horario laboral
        </span>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Inicio"
            suffix="h"
            value={toHour(settings.workWindow.start)}
            min={0}
            max={23}
            onChange={(h) => setSettings({ workWindow: { ...settings.workWindow, start: h * 60 } })}
          />
          <Field
            label="Fin"
            suffix="h"
            value={toHour(settings.workWindow.end)}
            min={1}
            max={24}
            onChange={(h) => setSettings({ workWindow: { ...settings.workWindow, end: h * 60 } })}
          />
        </div>
      </section>

      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Almuerzo
        </span>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Desde"
            suffix="h"
            value={lunch ? toHour(lunch.start) : 13}
            min={0}
            max={23}
            onChange={(h) => setSettings({ avoidWindows: [{ start: h * 60, end: lunch?.end ?? 14 * 60 }] })}
          />
          <Field
            label="Hasta"
            suffix="h"
            value={lunch ? toHour(lunch.end) : 14}
            min={1}
            max={24}
            onChange={(h) => setSettings({ avoidWindows: [{ start: lunch?.start ?? 13 * 60, end: h * 60 }] })}
          />
        </div>
      </section>

      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Descanso mínimo
        </span>
        <Field
          label="Entre series"
          suffix="min"
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
  suffix,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <div className="relative">
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
          className="pr-9 font-mono"
        />
        {suffix && (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
