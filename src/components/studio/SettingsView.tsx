import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const panelEnabled = useStore((s) => s.panelEnabled);
  const setPanelEnabled = useStore((s) => s.setPanelEnabled);
  const notificationsEnabled = useStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useStore((s) => s.setNotificationsEnabled);
  const snoozeMinutes = useStore((s) => s.snoozeMinutes);
  const setSnoozeMinutes = useStore((s) => s.setSnoozeMinutes);
  const demoMode = useStore((s) => s.demoMode);
  const setDemoMode = useStore((s) => s.setDemoMode);
  const replan = useStore((s) => s.replan);
  const resetSettings = useStore((s) => s.resetSettings);
  const resetAll = useStore((s) => s.resetAll);
  const lunch = settings.avoidWindows[0];

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <Section title="Apariencia">
        <Row label="Tema">
          <div className="bg-muted/50 flex gap-1 rounded-lg p-1">
            {THEME_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setThemeMode(m.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  theme.mode === m.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Acento">
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
        </Row>
      </Section>

      <Section title="Panel flotante">
        <Row label="Mostrar panel" hint="Mini-ventana siempre visible con el próximo ejercicio.">
          <Switch checked={panelEnabled} onCheckedChange={setPanelEnabled} />
        </Row>
      </Section>

      <Section title="Notificaciones">
        <Row label="Avisos de microset" hint="Te avisa cuando toca una serie.">
          <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
        </Row>
        <Row label="Tiempo de posponer">
          <div className="w-24">
            <NumberInput value={snoozeMinutes} suffix="min" min={5} max={120} step={5} onChange={setSnoozeMinutes} />
          </div>
        </Row>
      </Section>

      <Section title="Horario laboral">
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
      </Section>

      <Section title="Almuerzo">
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
      </Section>

      <Section title="Descanso mínimo">
        <Field
          label="Entre series"
          suffix="min"
          value={settings.minRest}
          min={5}
          max={180}
          step={5}
          onChange={(m) => setSettings({ minRest: m })}
        />
      </Section>

      <Section title="Modo demo">
        <Row
          label="Activar modo demo"
          hint="Agenda series desde ahora, ignorando tu horario, para probar la app."
        >
          <Switch checked={demoMode} onCheckedChange={setDemoMode} />
        </Row>
      </Section>

      <Section title="Datos">
        <Row label="Replanificar hoy" hint="Vuelve a repartir las series desde ahora.">
          <Button size="sm" variant="outline" onClick={replan}>
            Replanificar
          </Button>
        </Row>
        <Row label="Restablecer ajustes" hint="Horario, almuerzo y descanso a sus valores iniciales.">
          <Button size="sm" variant="outline" onClick={resetSettings}>
            Restablecer
          </Button>
        </Row>
        <Row label="Restablecer todo" hint="Borra rutina, equipo y registros. Vuelve de fábrica.">
          <Button size="sm" variant="destructive" onClick={resetAll}>
            Restablecer todo
          </Button>
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4`}>
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {title}
      </span>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
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
      <NumberInput value={value} suffix={suffix} onChange={onChange} min={min} max={max} step={step} />
    </div>
  );
}

function NumberInput({
  value,
  suffix,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  suffix?: string;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
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
        className="w-full pr-8 font-mono"
      />
      {suffix && (
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
          {suffix}
        </span>
      )}
    </div>
  );
}
