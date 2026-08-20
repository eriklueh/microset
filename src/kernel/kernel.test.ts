import { describe, it, expect } from "vitest";
import { BODY_GROUPS } from "@/domain/bodyGroups";
import type { Exercise, LogEntry } from "@/domain/types";
import { allModules, getModule } from "@/kernel";
import { logEntryToEvent, pausaContribute, pausaManifest, PAUSA_SET_DONE } from "@/modules/pausa/pausa";

// A self-contained fixture with explicit fine muscles so exerciseGroupRoles is deterministic.
const PULL: Exercise = {
  id: "test-pull",
  name: "Test Pull",
  equipment: [],
  muscle: "pull",
  primary: ["upper-back"], // → group "back"
  secondary: ["biceps"], //  → group "arms"
  measure: "reps",
  defaultSets: 3,
  defaultReps: "5",
  axis: [
    { id: "easy", label: "Easy", kind: "assist" },
    { id: "mid", label: "Mid", kind: "bodyweight" },
    { id: "hard", label: "Hard", kind: "load" },
  ],
};
const byId = (id: string): Exercise | undefined => (id === PULL.id ? PULL : undefined);

describe("Fase 0 — kernel contracts + Pausa module", () => {
  it("registers Pausa in the module registry on import", () => {
    expect(getModule("pausa")).toBe(pausaManifest);
    expect(allModules().some((m) => m.id === "pausa")).toBe(true);
  });

  it("contributes intrinsic effort/muscle XP for a known exercise", () => {
    const m = pausaContribute({ exerciseId: PULL.id, variantId: "hard" }, byId)!;
    expect(m.effortXp).toBeGreaterThan(0);
    const keys = Object.keys(m.muscleXp ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const g of keys) expect(BODY_GROUPS).toContain(g);
    // effortXp is exactly the sum of the per-group contributions.
    const sum = Object.values(m.muscleXp!).reduce((n, x) => n + (x ?? 0), 0);
    expect(m.effortXp).toBeCloseTo(sum, 6);
  });

  it("weights harder variants above easier ones", () => {
    const easy = pausaContribute({ exerciseId: PULL.id, variantId: "easy" }, byId)!;
    const hard = pausaContribute({ exerciseId: PULL.id, variantId: "hard" }, byId)!;
    expect(hard.effortXp!).toBeGreaterThan(easy.effortXp!);
  });

  it("returns undefined for an unknown exercise", () => {
    expect(pausaContribute({ exerciseId: "nope" }, byId)).toBeUndefined();
  });

  it("wraps a LogEntry into a deterministic pausa.set.done event", () => {
    const log: LogEntry = { at: "2026-08-20T12:00:00.000Z", exerciseId: PULL.id, variantId: "mid" };
    const ev = logEntryToEvent(log, byId);
    expect(ev.kind).toBe(PAUSA_SET_DONE);
    expect(ev.module).toBe("pausa");
    expect(ev.personId).toBe("self");
    expect(ev.at).toBe(log.at);
    expect(ev.metrics?.effortXp).toBeGreaterThan(0);
    // same log → same id (idempotent)
    expect(logEntryToEvent(log, byId).id).toBe(ev.id);
  });
});
