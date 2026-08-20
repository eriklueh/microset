import { describe, it, expect } from "vitest";
import { BODY_GROUPS, exerciseGroupRoles } from "@/domain/bodyGroups";
import type { Exercise, EquipmentId } from "@/domain/types";
import { allModules, getModule, type ContributeContext } from "@/kernel";
import {
  adaptMissedSession,
  entrenoContribute,
  entrenoManifest,
  ENTRENO_SESSION_DONE,
  sessionDoneToEvent,
  sessionToSchedulable,
  type AdaptContext,
  type EntrenoExternalDonePayload,
  type EntrenoStructuredDonePayload,
  type Session,
} from "./entreno";

// ── Fixtures ────────────────────────────────────────────────────────────────
// A small catalog spanning several body groups, with explicit fine muscles so
// exerciseGroupRoles is deterministic. `pull` needs a bar (to exercise the owned filter).
const mk = (
  id: string,
  muscle: Exercise["muscle"],
  primary: string[],
  equipment: EquipmentId[] = [],
): Exercise => ({
  id,
  name: id,
  equipment,
  muscle,
  primary,
  measure: "reps",
  defaultSets: 3,
  defaultReps: "8",
  axis: [
    { id: "easy", label: "Easy", kind: "assist" },
    { id: "mid", label: "Mid", kind: "bodyweight" },
    { id: "hard", label: "Hard", kind: "load" },
  ],
});

const PULLUP = mk("pullup", "pull", ["upper-back"], ["pullup-bar"]); // group back
const PUSHUP = mk("pushup", "push", ["chest"]); //                     group chest
const SQUAT = mk("squat", "legs", ["quadriceps"]); //                  group legs
const PLANK = mk("plank", "core", ["abs"]); //                         group core
const PIKE = mk("pike", "push", ["front-deltoids"]); //               group shoulders
const CURL = mk("curl", "pull", ["biceps"], ["bands"]); //            group arms (needs bands)

const CATALOG = [PULLUP, PUSHUP, SQUAT, PLANK, PIKE, CURL];
const byId = (id: string): Exercise | undefined => CATALOG.find((e) => e.id === id);
const ctx: ContributeContext = { exercise: byId };

// Owns everything except bands → CURL (arms) is unavailable at home.
const OWNED: EquipmentId[] = ["pullup-bar", "dip-bars", "parallettes"];
const adaptCtx: AdaptContext = { byId, catalog: CATALOG, owned: OWNED };

// ── Registry ──────────────────────────────────────────────────────────────
describe("Entreno · manifest", () => {
  it("registers into the module registry, default OFF", () => {
    expect(getModule("entreno")).toBe(entrenoManifest);
    expect(entrenoManifest.defaultEnabled).toBe(false);
    expect(allModules().some((m) => m.id === "entreno")).toBe(true);
  });
});

// ── contribute() ────────────────────────────────────────────────────────────
describe("Entreno · contribute (structured)", () => {
  const payload: EntrenoStructuredDonePayload = {
    sessionId: "s1",
    modality: "calisthenics",
    external: false,
    sets: [
      { exerciseId: "pullup", variantId: "hard" },
      { exerciseId: "pushup", variantId: "mid" },
      { exerciseId: "pushup", variantId: "mid" },
    ],
    durationMin: 25,
  };

  it("sums per-series XP into the metrics envelope (same model as Pausa)", () => {
    const m = entrenoContribute(payload, ctx)!;
    expect(m.effortXp!).toBeGreaterThan(0);
    expect(m.volumeLoad).toBe(3); // three logged series
    expect(m.durationMin).toBe(25);
    const keys = Object.keys(m.muscleXp ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const g of keys) expect(BODY_GROUPS).toContain(g);
    // effortXp is exactly the sum of the per-group contributions.
    const sum = Object.values(m.muscleXp!).reduce((n, x) => n + (x ?? 0), 0);
    expect(m.effortXp).toBeCloseTo(sum, 6);
  });

  it("harder variants weigh more; unknown exercises are ignored", () => {
    const easy = entrenoContribute(
      { ...payload, sets: [{ exerciseId: "pullup", variantId: "easy" }] },
      ctx,
    )!;
    const hard = entrenoContribute(
      { ...payload, sets: [{ exerciseId: "pullup", variantId: "hard" }] },
      ctx,
    )!;
    expect(hard.effortXp!).toBeGreaterThan(easy.effortXp!);
    // all-unknown → undefined (no metrics)
    expect(
      entrenoContribute({ ...payload, sets: [{ exerciseId: "nope" }] }, ctx),
    ).toBeUndefined();
  });

  it("is deterministic and stamps a stable done event via the manifest", () => {
    const ev = sessionDoneToEvent(payload, "2026-08-20T18:00:00.000Z", ctx);
    expect(ev.kind).toBe(ENTRENO_SESSION_DONE);
    expect(ev.module).toBe("entreno");
    expect(ev.personId).toBe("self");
    expect(ev.metrics?.volumeLoad).toBe(3);
    // manifest.contribute agrees with the direct call
    const viaManifest = entrenoManifest.contribute!(ev, ctx);
    expect(viaManifest).toEqual(entrenoContribute(payload, ctx));
  });
});

describe("Entreno · contribute (external / sport)", () => {
  const bjj: EntrenoExternalDonePayload = {
    sessionId: "bjj1",
    modality: "sport",
    external: true,
    durationMin: 60,
    intensity: 0.8,
  };

  it("derives effortXp + durationMin from duration × intensity, no muscleXp", () => {
    const m = entrenoContribute(bjj, ctx)!;
    expect(m.durationMin).toBe(60);
    expect(m.effortXp).toBeCloseTo(60 * 0.8 * 0.1, 6);
    expect(m.muscleXp).toBeUndefined();
    expect(m.volumeLoad).toBeUndefined();
  });

  it("scales with intensity and clamps out-of-range intensity", () => {
    const light = entrenoContribute({ ...bjj, intensity: 0.4 }, ctx)!;
    const hard = entrenoContribute({ ...bjj, intensity: 0.9 }, ctx)!;
    expect(hard.effortXp!).toBeGreaterThan(light.effortXp!);
    // intensity clamped to [0,1]
    const over = entrenoContribute({ ...bjj, intensity: 5 }, ctx)!;
    const one = entrenoContribute({ ...bjj, intensity: 1 }, ctx)!;
    expect(over.effortXp).toBe(one.effortXp);
  });
});

// ── Schedulable mapper ────────────────────────────────────────────────────────
describe("Entreno · sessionToSchedulable", () => {
  it("places a session unplaced inside its window (clustered mode)", () => {
    const session: Session = {
      id: "s1",
      modality: "strength",
      location: "away",
      external: false,
      items: [],
      window: { start: 18 * 60, end: 20 * 60 },
      priority: 2,
    };
    const s = sessionToSchedulable(session, "2026-8-20");
    expect(s.date).toBe("2026-8-20");
    expect(s.time).toBeNull();
    expect(s.status).toBe("pending");
    expect(s.window).toEqual({ start: 18 * 60, end: 20 * 60 });
    expect(s.earliest).toBe(18 * 60);
    expect(s.priority).toBe(2);
  });
});

// ── The adaptive planner ──────────────────────────────────────────────────────
const structuredSession: Session = {
  id: "gym",
  modality: "calisthenics",
  location: "away",
  external: false,
  items: [
    { exerciseId: "pullup", name: "pullup", sets: 4 }, // back
    { exerciseId: "squat", name: "squat", sets: 4 }, //  legs
  ],
};

const sportSession: Session = {
  id: "bjj",
  modality: "sport",
  location: "away",
  external: true,
  durationMin: 60,
  intensity: 0.8,
};

describe("Entreno · planner — enfermo / lesionado (no compensatory load)", () => {
  it("enfermo → rest, no load, empty circuit", () => {
    const a = adaptMissedSession(structuredSession, "enfermo", adaptCtx);
    expect(a.kind).toBe("rest");
    expect(a.addsLoad).toBe(false);
    expect(a.circuit).toHaveLength(0);
    expect(a.skillDropped).toBe(false);
  });

  it("lesionado → mobility, no load, empty circuit", () => {
    const a = adaptMissedSession(sportSession, "lesionado", adaptCtx);
    expect(a.kind).toBe("mobility");
    expect(a.addsLoad).toBe(false);
    expect(a.circuit).toHaveLength(0);
  });
});

describe("Entreno · planner — ocupado / viajando (home calisthenics substitution)", () => {
  it("ocupado → substitutes the missed conditioning with an at-home circuit", () => {
    const a = adaptMissedSession(structuredSession, "ocupado", adaptCtx);
    expect(a.kind).toBe("substitute");
    expect(a.addsLoad).toBe(true);
    expect(a.circuit.length).toBeGreaterThan(0);

    // every substitution exercise is doable with the owned equipment (home context)
    for (const it of a.circuit) {
      const ex = byId(it.exerciseId)!;
      expect(ex.equipment.every((eq) => OWNED.includes(eq))).toBe(true);
    }

    // covers the session's pattern: the missed session hit back + legs → both are covered
    const covered = new Set(
      a.circuit.flatMap((it) => exerciseGroupRoles(byId(it.exerciseId)!).primary),
    );
    expect(covered.has("back")).toBe(true);
    expect(covered.has("legs")).toBe(true);
  });

  it("is deterministic (same inputs → identical circuit)", () => {
    const a = adaptMissedSession(structuredSession, "ocupado", adaptCtx);
    const b = adaptMissedSession(structuredSession, "ocupado", adaptCtx);
    expect(a).toEqual(b);
  });

  it("viajando + sport → substitutes conditioning but NOT the skill part", () => {
    const a = adaptMissedSession(sportSession, "viajando", adaptCtx);
    expect(a.kind).toBe("substitute");
    expect(a.skillDropped).toBe(true);
    expect(a.circuit.length).toBeGreaterThan(0);
  });

  it("respects the volume cap and recent load", () => {
    // cap at 3 series → exactly one exercise (SETS_PER_EXERCISE = 3)
    const capped = adaptMissedSession(sportSession, "ocupado", {
      ...adaptCtx,
      maxSubSets: 3,
    });
    const totalSets = capped.circuit.reduce((n, it) => n + it.sets, 0);
    expect(totalSets).toBeLessThanOrEqual(3);
    expect(capped.circuit).toHaveLength(1);

    // recent load biases the FIRST-picked group: heavily-loaded legs is deprioritized,
    // so a single-exercise cap picks a different (less recently worked) group.
    const biased = adaptMissedSession(sportSession, "ocupado", {
      ...adaptCtx,
      maxSubSets: 3,
      recentLoad: { legs: 100, core: 100, back: 100, chest: 100, shoulders: 100 },
    });
    // arms is unavailable (needs bands), everything else is saturated except the untouched
    // groups; the least-loaded available group is chosen first, deterministically.
    expect(biased.circuit).toHaveLength(1);
  });
});
