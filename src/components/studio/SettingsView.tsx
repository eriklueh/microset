import type { ReactNode } from "react";
import { ACCENTS, THEME_MODES } from "@/lib/theme";
import { openConfigFolder } from "@/lib/windows";
import { reloadFromFiles } from "@/store/files";
import { useT, LangSelect } from "@/lib/i18n";
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
  const coach = useStore((s) => s.coach);
  const setCoachConfig = useStore((s) => s.setCoachConfig);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const replan = useStore((s) => s.replan);
  const resetSettings = useStore((s) => s.resetSettings);
  const resetAll = useStore((s) => s.resetAll);
  const t = useT();
  const lunch = settings.avoidWindows[0];
  const modeLabel: Record<string, string> = {
    light: t.settings.modeLight,
    dark: t.settings.modeDark,
    system: t.settings.modeSystem,
  };

  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title={t.settings.title} sub={t.settings.sub} />

      <Section title={t.settings.appearance}>
        <Row label={t.settings.theme}>
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
                  {(modeLabel[m.id] ?? m.label).toUpperCase()}
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t.settings.accent}>
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
        <Row label={t.settings.languageLabel}>
          <LangSelect />
        </Row>
      </Section>

      <Section title={t.settings.panelSection}>
        <Row label={t.settings.showPanel} hint={t.settings.showPanelHint}>
          <SquareSwitch on={panelEnabled} onClick={() => setPanelEnabled(!panelEnabled)} />
        </Row>
      </Section>

      <Section title={t.settings.notifications}>
        <Row label={t.settings.notifLabel} hint={t.settings.notifHint}>
          <SquareSwitch
            on={notificationsEnabled}
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          />
        </Row>
        <Row label={t.settings.snoozeLabel}>
          <div className="w-24">
            <NumberInput value={snoozeMinutes} suffix="min" min={5} max={120} step={5} onChange={setSnoozeMinutes} />
          </div>
        </Row>
      </Section>

      <Section title={t.settings.work}>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t.settings.start}
            suffix="h"
            value={toHour(settings.workWindow.start)}
            min={0}
            max={23}
            onChange={(h) => setSettings({ workWindow: { ...settings.workWindow, start: h * 60 } })}
          />
          <Field
            label={t.settings.end}
            suffix="h"
            value={toHour(settings.workWindow.end)}
            min={1}
            max={24}
            onChange={(h) => setSettings({ workWindow: { ...settings.workWindow, end: h * 60 } })}
          />
        </div>
      </Section>

      <Section title={t.settings.lunch}>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t.settings.from}
            suffix="h"
            value={lunch ? toHour(lunch.start) : 13}
            min={0}
            max={23}
            onChange={(h) => setSettings({ avoidWindows: [{ start: h * 60, end: lunch?.end ?? 14 * 60 }] })}
          />
          <Field
            label={t.settings.to}
            suffix="h"
            value={lunch ? toHour(lunch.end) : 14}
            min={1}
            max={24}
            onChange={(h) => setSettings({ avoidWindows: [{ start: lunch?.start ?? 13 * 60, end: h * 60 }] })}
          />
        </div>
      </Section>

      <Section title={t.settings.minRest}>
        <Field
          label={t.settings.between}
          suffix="min"
          value={settings.minRest}
          min={5}
          max={180}
          step={5}
          onChange={(m) => setSettings({ minRest: m })}
        />
      </Section>

      <Section title={t.settings.coach}>
        <Row label={t.settings.provider}>
          <div className="flex">
            {(["anthropic", "local"] as const).map((p, i) => {
              const on = coach.provider === p;
              return (
                <button
                  key={p}
                  onClick={() => setCoachConfig({ provider: p })}
                  className="border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
                  style={{
                    borderColor: on ? "var(--acc)" : "var(--rule2)",
                    background: on ? "var(--acc)" : "transparent",
                    color: on ? "var(--on)" : "var(--dim)",
                    marginLeft: i ? -1 : 0,
                    position: "relative",
                    zIndex: on ? 1 : 0,
                  }}
                >
                  {p === "anthropic" ? "API" : "LOCAL"}
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t.settings.model} hint={coach.provider === "local" ? undefined : t.settings.modelHint}>
          <input
            value={coach.model}
            onChange={(e) => setCoachConfig({ model: e.currentTarget.value })}
            aria-label={t.settings.model}
            className={`${input} h-9 w-[200px] px-2.5 font-mono text-[12px]`}
          />
        </Row>
        {coach.provider === "local" && (
          <Row label={t.settings.endpoint} hint={t.settings.endpointHint}>
            <input
              value={coach.endpoint}
              onChange={(e) => setCoachConfig({ endpoint: e.currentTarget.value })}
              aria-label={t.settings.endpoint}
              className={`${input} h-9 w-[230px] px-2.5 font-mono text-[12px]`}
            />
          </Row>
        )}
        <ProfileField label={t.settings.goals} value={profile.goals} onChange={(v) => setProfile({ goals: v })} placeholder={t.settings.goalsPh} />
        <ProfileField label={t.settings.diet} value={profile.diet} onChange={(v) => setProfile({ diet: v })} placeholder={t.settings.dietPh} />
        <ProfileField label={t.settings.constraints} value={profile.constraints} onChange={(v) => setProfile({ constraints: v })} placeholder={t.settings.constraintsPh} />
      </Section>

      <Section title={t.settings.demo}>
        <Row label={t.settings.demoLabel} hint={t.settings.demoHint}>
          <SquareSwitch on={demoMode} onClick={() => setDemoMode(!demoMode)} />
        </Row>
      </Section>

      <Section title={t.settings.data}>
        <Row label={t.settings.configFolder} hint={t.settings.configFolderHint}>
          <button className={dataBtn} onClick={() => void openConfigFolder()}>
            {t.settings.openFolder}
          </button>
        </Row>
        <Row label={t.settings.reload} hint={t.settings.reloadHint}>
          <button className={dataBtn} onClick={() => void reloadFromFiles()}>
            {t.settings.reloadBtn}
          </button>
        </Row>
        <Row label={t.settings.replan} hint={t.settings.replanHint}>
          <button className={dataBtn} onClick={replan}>
            {t.settings.replanBtn}
          </button>
        </Row>
        <Row label={t.settings.resetSettings} hint={t.settings.resetSettingsHint}>
          <button className={dataBtn} onClick={resetSettings}>
            {t.settings.resetBtn}
          </button>
        </Row>
        <Row label={t.settings.resetAll} hint={t.settings.resetAllHint}>
          <button
            className="border px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.06em]"
            style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
            onClick={resetAll}
          >
            {t.settings.resetAllBtn}
          </button>
        </Row>
      </Section>
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--faint)]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        rows={2}
        placeholder={placeholder}
        className={`${input} resize-none px-3 py-2 text-[13px] leading-[1.5] placeholder:text-[var(--faint2)]`}
      />
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
