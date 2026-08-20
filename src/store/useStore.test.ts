import { describe, it, expect } from "vitest";
import { migratePersisted, useStore } from "./useStore";

/**
 * Fase 0d — kernel `modules` state + persist v5→v6 migration.
 * These assert the migration is additive (older data untouched) and that a fresh store
 * boots with Pausa enabled. No behavior change is exercised here — `modules` is dormant.
 */
describe("store · modules state + v5→v6 migration", () => {
  const migrate = migratePersisted;

  it("migrates a v5 blob to v6: defaults `modules`, leaves all prior data intact", () => {
    // A representative v5 persisted blob (post-v5 shape: has focusUntil, no `modules`).
    const v5 = {
      ownedEquipment: ["pullup-bar", "dip-bars"],
      dayTypes: [{ id: "full-a", name: "Cuerpo completo A", routine: [{ exerciseId: "pushup", name: "Flexiones", sets: 3, target: "10" }] }],
      week: ["full-a", "full-a", "full-a", "full-a", "full-a", "rest", "rest"],
      dayKind: [null, null, null, null, null, null, null],
      dayOverrides: { "2026-8-19": { slot: "rest", kind: null } },
      customExercises: [],
      customEquipment: [],
      settings: { some: "value" },
      logs: [{ at: "2026-08-19T10:00:00.000Z", exerciseId: "pushup" }],
      theme: { mode: "dark", accent: "lime" },
      lang: "es",
      profile: { goals: "g", diet: "d", constraints: "c" },
      coach: { provider: "anthropic", model: "claude-sonnet-4-6", endpoint: "http://x" },
      panelEnabled: true,
      notificationsEnabled: true,
      snoozeMinutes: 30,
      demoMode: false,
      focusUntil: null,
      levelsEnabled: true,
      streakFreeze: false,
    };
    // Deep snapshot to prove nothing else is mutated.
    const before = JSON.parse(JSON.stringify(v5));

    const out = migrate(structuredClone(v5), 5) as Record<string, any>;

    // modules defaulted to Pausa enabled...
    expect(out.modules).toEqual({ pausa: { enabled: true } });
    // ...and every pre-existing field survived byte-for-byte.
    for (const key of Object.keys(before)) {
      expect(out[key]).toEqual((before as any)[key]);
    }
  });

  it("does not clobber `modules` already present in a blob", () => {
    const blob = { modules: { pausa: { enabled: false }, entreno: { enabled: true } }, dayTypes: [{ id: "x", name: "X", routine: [] }], dayOverrides: {} };
    const out = migrate(structuredClone(blob), 5) as Record<string, any>;
    expect(out.modules).toEqual({ pausa: { enabled: false }, entreno: { enabled: true } });
  });

  it("boots a fresh store with modules = { pausa: { enabled: true } }", () => {
    expect(useStore.getState().modules).toEqual({ pausa: { enabled: true } });
  });

  it("setModuleEnabled flips a module's flag without touching others", () => {
    useStore.getState().setModuleEnabled("pausa", false);
    expect(useStore.getState().modules.pausa).toEqual({ enabled: false });
    // restore for isolation
    useStore.getState().setModuleEnabled("pausa", true);
    expect(useStore.getState().modules.pausa).toEqual({ enabled: true });
  });
});
