import type { ReactNode } from "react";
import { ACCENTS, THEME_MODES } from "@/lib/theme";
import { openConfigFolder } from "@/lib/windows";
import { reloadFromFiles } from "@/store/files";
import { useT, LangSelect } from "@/lib/i18n";
import { useStore } from "@/store/useStore";
import { ViewHeader, CockpitRail, RailStat } from "./shell";
import { SectionRule } from "./hud";
import { SquareSwitch } from "./EquipmentView";

/** App version — mirrors the Titlebar build stamp. */
const APP_VERSION = "2.6.0";

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
  const focusUntil = useStore((s) => s.focusUntil);
  const setFocus = useStore((s) => s.setFocus);
  const clearFocus = useStore((s) => s.clearFocus);
  const demoMode = useStore((s) => s.demoMode);
  const setDemoMode = useStore((s) => s.setDemoMode);
  const levelsEnabled = useStore((s) => s.levelsEnabled);
  const setLevelsEnabled = useStore((s) => s.setLevelsEnabled);
  const streakFreeze = useStore((s) => s.streakFreeze);
  const setStreakFreeze = useStore((s) => s.setStreakFreeze);
  const coach = useStore((s) => s.coach);
  const setCoachConfig = useStore((s) => s.setCoachConfig);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const replan = useStore((s) => s.replan);
  const resetSettings = useStore((s) => s.resetSettings);
  const resetAll = useStore((s) => s.resetAll);
  const t = useT();
  const lunch = settings.avoidWindows[0];
  const focusActive = focusUntil != null && Date.now() < focusUntil;
  const focusRemaining = focusActive ? Math.max(1, Math.ceil((focusUntil! - Date.now()) / 60_000)) : 0;
  const modeLabel: Record<string, string> = {
    light: t.settings.modeLight,
    dark: t.settings.modeDark,
    system: t.settings.modeSystem,
  };

  return (
    <div className="flex h-full flex-col">
      <ViewHeader kicker={t.settings.sub} title={t.settings.title} />
      <div className="flex min-h-0 flex-1">
      <CockpitRail label={t.settings.railLabel}>
        <span className="font-mono text-[9px] tracking-[0.14em] text-[var(--faint)]">
          {t.settings.railVersion}
        </span>
        <RailStat value={APP_VERSION} unit={t.settings.title} />
        <div className="mt-4 border-t border-[var(--rule)] pt-3">
          <div className="mb-1.5 font-mono text-[9px] tracking-[0.14em] text-[var(--faint)]">
            {t.settings.railLang}
          </div>
          <LangSelect />
        </div>
      </CockpitRail>

      <section className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
      <SectionRule index={1} label={t.settings.groupPrefs} />
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

      <Section title={t.settings.focusSection}>
        <Row label={t.focus.start} hint={t.focus.hint}>
          {focusActive ? (
            <div className="flex items-center gap-2">
              <span className="font-pixel text-[20px] leading-none tabular-nums text-[var(--fg)]">
                {focusRemaining}
              </span>
              <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">
                {t.focus.remaining}
              </span>
              <button
                className="ml-1 border border-[var(--rule2)] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
                onClick={clearFocus}
              >
                {t.focus.end}
              </button>
            </div>
          ) : (
            <div className="flex">
              {[15, 30, 60].map((m, i) => (
                <button
                  key={m}
                  onClick={() => setFocus(m)}
                  className="border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
                  style={{ borderColor: "var(--rule2)", marginLeft: i ? -1 : 0 }}
                >
                  {m} {t.panel.min}
                </button>
              ))}
            </div>
          )}
        </Row>
      </Section>

      <div className="mt-6">
        <SectionRule index={2} label={t.settings.groupSchedule} />
      </div>
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

      <div className="mt-6">
        <SectionRule index={3} label={t.settings.groupCoach} />
      </div>
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

      <Section title={t.settings.levels}>
        <Row label={t.settings.levelsLabel} hint={t.settings.levelsHint}>
          <SquareSwitch on={levelsEnabled} onClick={() => setLevelsEnabled(!levelsEnabled)} />
        </Row>
        {levelsEnabled && (
          <Row label={t.settings.streakFreezeLabel} hint={t.settings.streakFreezeHint}>
            <SquareSwitch on={streakFreeze} onClick={() => setStreakFreeze(!streakFreeze)} />
          </Row>
        )}
      </Section>

      <Section title={t.settings.demo}>
        <Row label={t.settings.demoLabel} hint={t.settings.demoHint}>
          <SquareSwitch on={demoMode} onClick={() => setDemoMode(!demoMode)} />
        </Row>
      </Section>

      <div className="mt-6">
        <SectionRule index={4} label={t.settings.groupData} />
      </div>
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
      </section>
      </div>
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
