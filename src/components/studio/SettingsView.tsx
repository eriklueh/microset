import type { ReactNode } from "react";
import { ACCENTS, THEME_MODES } from "@/lib/theme";
import { useStore } from "@/store/useStore";
import { Masthead } from "./Masthead";
import { SquareSwitch } from "./EquipmentView";

const toHour = (min: number) => Math.round(min / 60);
const input = "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";
const dataBtn = "border border-[var(--rule2)] px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--fg)] hover:border-[var(--fg)]";

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
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="AJUSTES" sub="CONFIGURACIÓN" />

      <Section title="APARIENCIA">
        <Row label="Tema">
          <div className="flex">
            {THEME_MODES.map((m, i) => {
              const on = theme.mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setThemeMode(m.id)}
                  className="border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
                  style={{
                    borderColor: on ? "var(--acc)" : "var(--rule2)",
                    background: on ? "var(--acc)" : "transparent",
                    color: on ? "var(--on)" : "var(--dim)",
                    marginLeft: i ? -1 : 0,
                    zIndex: on ? 1 : 0,
                    position: "relative",
                  }}
                >
                  {m.label.toUpperCase()}
                </button>
              );
            })}
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
                className="size-6 border-2"
                style={{
                  background: a.swatch,
                  borderColor: theme.accent === a.id ? "var(--fg)" : "transparent",
                }}
              />
            ))}
          </div>
        </Row>
      </Section>

      <Section title="PANEL FLOTANTE">
        <Row label="Mostrar panel" hint="Mini-ventana siempre visible con el próximo ejercicio.">
          <SquareSwitch on={panelEnabled} onClick={() => setPanelEnabled(!panelEnabled)} />
        </Row>
      </Section>

      <Section title="NOTIFICACIONES">
        <Row label="Avisos de microset" hint="Te avisa cuando toca una serie.">
          <SquareSwitch
            on={notificationsEnabled}
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          />
        </Row>
        <Row label="Tiempo de posponer">
          <div className="w-24">
            <NumberInput value={snoozeMinutes} suffix="min" min={5} max={120} step={5} onChange={setSnoozeMinutes} />
          </div>
        </Row>
      </Section>

      <Section title="HORARIO LABORAL">
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

      <Section title="ALMUERZO">
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

      <Section title="DESCANSO MÍNIMO">
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

      <Section title="MODO DEMO">
        <Row label="Activar modo demo" hint="Agenda series desde ahora, ignorando tu horario, para probar la app.">
          <SquareSwitch on={demoMode} onClick={() => setDemoMode(!demoMode)} />
        </Row>
      </Section>

      <Section title="DATOS">
        <Row label="Replanificar hoy" hint="Vuelve a repartir las series desde ahora.">
          <button className={dataBtn} onClick={replan}>
            REPLANIFICAR
          </button>
        </Row>
        <Row label="Restablecer ajustes" hint="Horario, almuerzo y descanso a sus valores iniciales.">
          <button className={dataBtn} onClick={resetSettings}>
            RESTABLECER
          </button>
        </Row>
        <Row label="Restablecer todo" hint="Borra rutina, equipo y registros. Vuelve de fábrica.">
          <button
            className="border px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.06em]"
            style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
            onClick={resetAll}
          >
            RESTABLECER TODO
          </button>
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 border border-[var(--rule2)] p-4">
      <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--faint)]">
        {title}
      </span>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13.5px] text-[var(--fg)]">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--faint)]">{hint}</div>}
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
      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint)] uppercase">{label}</span>
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
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className={`${input} h-9 w-full px-2.5 pr-9 font-mono text-[13px]`}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-[var(--faint2)]">
          {suffix}
        </span>
      )}
    </div>
  );
}
