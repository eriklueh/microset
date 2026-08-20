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

/**
 * Fase 2b — Entreno module state + persist v6→v7 migration. The module is default OFF, so
 * this is dormant plumbing: the migration must be additive and a fresh store boots empty.
 */
describe("store · entreno state + v6→v7 migration", () => {
  it("migrates a v6 blob to v7: defaults empty `entreno`, leaves all prior data intact", () => {
    const v6 = {
      dayTypes: [{ id: "a", name: "A", routine: [] }],
      dayOverrides: {},
      logs: [{ at: "2026-08-19T10:00:00.000Z", exerciseId: "pushup" }],
      settings: { some: "value" },
      modules: { pausa: { enabled: true } },
      levelsEnabled: true,
      streakFreeze: false,
      focusUntil: null,
    };
    const before = JSON.parse(JSON.stringify(v6));
    const out = migratePersisted(structuredClone(v6), 6) as Record<string, any>;
    expect(out.entreno).toEqual({ sessions: [], week: [null, null, null, null, null, null, null], records: [] });
    for (const key of Object.keys(before)) expect(out[key]).toEqual((before as any)[key]);
  });

  it("does not clobber an `entreno` already present", () => {
    const blob = {
      entreno: { sessions: [{ id: "s1" }], week: Array(7).fill(null), records: [] },
      dayTypes: [{ id: "x", name: "X", routine: [] }],
      dayOverrides: {},
    };
    const out = migratePersisted(structuredClone(blob), 6) as Record<string, any>;
    expect(out.entreno.sessions).toEqual([{ id: "s1" }]);
  });

  it("boots a fresh store with empty entreno state", () => {
    const e = useStore.getState().entreno;
    expect(e.sessions).toEqual([]);
    expect(e.records).toEqual([]);
    expect(e.week).toHaveLength(7);
  });

  it("skipEntrenoSession records the outcome with its motive; remove cleans up", () => {
    const id = useStore
      .getState()
      .addEntrenoSession({ modality: "sport", location: "away", external: true, durationMin: 60, intensity: 0.8 });
    useStore.getState().skipEntrenoSession(id, "enfermo");
    const rec = useStore.getState().entreno.records.find((r) => r.sessionId === id);
    expect(rec?.status).toBe("skipped");
    expect(rec?.reason).toBe("enfermo");
    useStore.getState().removeEntrenoSession(id);
    expect(useStore.getState().entreno.sessions.find((s) => s.id === id)).toBeUndefined();
    expect(useStore.getState().entreno.records.find((r) => r.sessionId === id)).toBeUndefined();
  });
});
