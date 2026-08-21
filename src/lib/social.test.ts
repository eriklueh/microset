import { describe, it, expect } from "vitest";
import {
  computeAdherence,
  computeForma,
  currentSeasonId,
  parseSharedRoutine,
  serializeDayType,
  type EffortSample,
  type SharedDayType,
} from "./social";

describe("social · currentSeasonId (ISO week, local)", () => {
  it("formats as AAAA-Wnn with a zero-padded, two-digit week", () => {
    const id = currentSeasonId(new Date(2026, 0, 1)); // Thu 2026-01-01 → week 1
    expect(id).toBe("2026-W01");
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("uses the ISO week-numbering YEAR (a Jan date can belong to the prior year)", () => {
    // Fri 2021-01-01 falls in ISO 2020-W53.
    expect(currentSeasonId(new Date(2021, 0, 1))).toBe("2020-W53");
    // Sun 2023-01-01 falls in ISO 2022-W52.
    expect(currentSeasonId(new Date(2023, 0, 1))).toBe("2022-W52");
  });

  it("keeps a full Mon→Sun week in the same season bucket", () => {
    const mon = currentSeasonId(new Date(2026, 7, 17)); // Mon 2026-08-17
    const sun = currentSeasonId(new Date(2026, 7, 23)); // Sun 2026-08-23
    expect(mon).toBe(sun);
    // …and the next Monday rolls over to the next week.
    expect(currentSeasonId(new Date(2026, 7, 24))).not.toBe(mon);
  });

  it("defaults to now when called without an argument", () => {
    expect(currentSeasonId()).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("social · computeAdherence (día-level, 0..1)", () => {
  const REST = "rest";
  // Wed 2026-08-19 → todayIdx = 2, so the window is Mon 08-17 → Wed 08-19 (inclusive).
  const wed = new Date(2026, 7, 19, 12, 0);
  const logOn = (m0: number, d: number) => ({ at: new Date(2026, m0, d, 12, 0).toISOString() });

  it("= díasEntrenados / díasProgramados when every day Mon→today is programmed", () => {
    const logs = [logOn(7, 17), logOn(7, 19)]; // trained Mon + Wed, out of Mon/Tue/Wed
    expect(computeAdherence(logs, () => "train", REST, wed)).toBeCloseTo(2 / 3, 6);
  });

  it("rest days are NOT counted as programmed", () => {
    const slot = (k: string) => (k === "2026-8-18" ? REST : "train"); // Tue is rest
    const logs = [logOn(7, 17), logOn(7, 19)]; // both programmed days trained
    expect(computeAdherence(logs, slot, REST, wed)).toBe(1);
  });

  it("counts a day at most once and caps the ratio at 1", () => {
    const slot = (k: string) => (k === "2026-8-17" ? "train" : REST); // only Mon programmed
    const logs = [logOn(7, 17), logOn(7, 17), logOn(7, 18), logOn(7, 19)]; // extra + off-plan logs
    expect(computeAdherence(logs, slot, REST, wed)).toBe(1);
  });

  it("all-rest week so far → 1 if anything was trained, else 0", () => {
    expect(computeAdherence([logOn(7, 18)], () => REST, REST, wed)).toBe(1);
    expect(computeAdherence([], () => REST, REST, wed)).toBe(0);
  });

  it("returns 0 when days were programmed but nothing was trained", () => {
    expect(computeAdherence([], () => "train", REST, wed)).toBe(0);
  });
});

describe("social · computeForma (persistente, decae)", () => {
  // Semanas ISO por su lunes (lunes consecutivos ⇒ semanas ISO consecutivas).
  const MON: Record<string, Date> = {
    S1: new Date(2026, 6, 13, 12, 0), // lun 2026-07-13
    S2: new Date(2026, 6, 20, 12, 0),
    S3: new Date(2026, 6, 27, 12, 0),
    S4: new Date(2026, 7, 3, 12, 0), // lun 2026-08-03
    S5: new Date(2026, 7, 10, 12, 0),
    S6: new Date(2026, 7, 17, 12, 0),
    S7: new Date(2026, 7, 24, 12, 0),
    S8: new Date(2026, 7, 31, 12, 0),
  };
  const midWeek = (mon: Date) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4, 12);
  /** Una semana de esfuerzo `total` como una única muestra en su lunes. */
  const week = (mon: Date, total: number): EffortSample => ({ at: mon.toISOString(), effortXp: total });

  it("T1 — sin muestras usables ⇒ 0", () => {
    expect(computeForma([])).toBe(0);
    expect(computeForma([], MON.S8)).toBe(0);
  });

  it("T2 — determinista: misma entrada + mismo now ⇒ mismo entero", () => {
    const s = [week(MON.S1, 120), week(MON.S2, 120), week(MON.S3, 120)];
    const now = midWeek(MON.S4);
    expect(computeForma(s, now)).toBe(computeForma(s, now));
  });

  it("T3 — nunca NaN, siempre entero acotado a [0,2000] (incluso con basura)", () => {
    const garbage: EffortSample[] = [
      { at: "no-es-fecha", effortXp: 50 },
      { at: MON.S2.toISOString(), effortXp: Number.NaN },
      { at: MON.S3.toISOString(), effortXp: -999 },
      { at: new Date(2027, 0, 1).toISOString(), effortXp: 5000 }, // futuro
      { at: MON.S3.toISOString(), effortXp: 10_000 }, // enorme
    ];
    const r = computeForma(garbage, MON.S8);
    expect(Number.isInteger(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(2000);
  });

  it("T4 — constancia (4 sem ~120) supera a un pico aislado", () => {
    const consistent = [
      week(MON.S1, 120),
      week(MON.S2, 120),
      week(MON.S3, 120),
      week(MON.S4, 120),
    ];
    const fourWeeks = computeForma(consistent, midWeek(MON.S4)); // cerrando la 4a (semana viva)
    expect(fourWeeks).toBeGreaterThan(1080);
    expect(fourWeeks).toBeLessThan(1160);

    // Una única semana bestial hace 1 semana, luego idle.
    const peak = computeForma([week(MON.S3, 400)], midWeek(MON.S4));
    expect(peak).toBeLessThanOrEqual(600);
    expect(fourWeeks).toBeGreaterThan(peak);
  });

  it("T5 — decae ≥60% tras 3 semanas idle (0.7^3 = 0.343)", () => {
    const trained = [week(MON.S1, 120), week(MON.S2, 120), week(MON.S3, 120), week(MON.S4, 120)];
    const base = computeForma(trained, midWeek(MON.S5)); // S4 ya completa, S5 viva sin logs
    const after3idle = computeForma(trained, midWeek(MON.S8)); // S5,S6,S7 idle completas
    expect(after3idle).toBeLessThanOrEqual(0.4 * base);
  });

  it("T6 — techo estructural de una sola semana (α·CEIL = 600)", () => {
    // Usuario nuevo, una única semana con esfuerzo enorme, medida esa MISMA semana (viva).
    const r = computeForma([week(MON.S4, 500)], midWeek(MON.S4));
    expect(r).toBeLessThanOrEqual(600);
  });

  it("T7 — monótona en esfuerzo: una semana pasada más fuerte no baja FORMA", () => {
    const weak = [week(MON.S1, 120), week(MON.S2, 60), week(MON.S3, 120)];
    const strong = [week(MON.S1, 120), week(MON.S2, 200), week(MON.S3, 120)];
    expect(computeForma(strong, midWeek(MON.S4))).toBeGreaterThanOrEqual(
      computeForma(weak, midWeek(MON.S4)),
    );
  });

  it("T8 — semana viva sólo sube (anti-lunes): entrar a S5 sin logs === cierre de S4", () => {
    const trained = [week(MON.S1, 120), week(MON.S2, 120), week(MON.S3, 120), week(MON.S4, 120)];
    const closeS4 = computeForma(trained, midWeek(MON.S4)); // S4 viva, ya entrenada
    const openS5 = computeForma(trained, midWeek(MON.S5)); // S5 viva, sin logs aún
    expect(openS5).toBe(closeS4);
  });

  it("T9 — saturación: plan chico satura ~fp(30), plan sustancial lo supera", () => {
    const sustained = (perWeek: number, weeks: number, now: Date) => {
      const s: EffortSample[] = [];
      // `weeks` semanas consecutivas terminando en la semana de `now` (inclusive).
      for (let i = weeks - 1; i >= 0; i--) {
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
        s.push(week(mon, perWeek));
      }
      return s;
    };
    const now = midWeek(MON.S8);
    const small = computeForma(sustained(30, 20, now), now); // fp(30) ≈ 567
    expect(small).toBeGreaterThan(540);
    expect(small).toBeLessThan(590);
    const big = computeForma(sustained(120, 20, now), now);
    expect(big).toBeGreaterThan(small);
  });
});

describe("social · compartir rutinas (serialize / parse round-trip)", () => {
  const dt: SharedDayType = {
    name: "Cuerpo completo A",
    intensity: "normal",
    window: { start: 1200, end: 1245 },
    minRest: 3,
    routine: [
      { exerciseId: "pullups", name: "Dominadas", sets: 3, target: "5-6", variantId: "b-mid" },
      { exerciseId: "dips", name: "Fondos", sets: 3, target: "5-6" },
    ],
  };

  it("round-trips a full day-type without its id", () => {
    const back = parseSharedRoutine(serializeDayType(dt));
    expect(back).toEqual(dt);
    expect(back).not.toHaveProperty("id");
  });

  it("returns null on bad JSON, missing name, or zero valid items", () => {
    expect(parseSharedRoutine("{not json")).toBeNull();
    expect(parseSharedRoutine(JSON.stringify({ routine: [] }))).toBeNull();
    expect(parseSharedRoutine(JSON.stringify({ name: "X", routine: "nope" }))).toBeNull();
    expect(parseSharedRoutine(JSON.stringify({ name: "X", routine: [{ foo: 1 }] }))).toBeNull();
  });

  it("drops invalid items but keeps the valid ones, clamping sets to 1..20", () => {
    const payload = JSON.stringify({
      name: "Mixta",
      routine: [
        { exerciseId: "a", name: "A", sets: 99 }, // clamped to 20
        { exerciseId: "b", name: "B" }, // missing sets → defaults to 1
        { name: "no id" }, // dropped
        "garbage", // dropped
      ],
    });
    const back = parseSharedRoutine(payload)!;
    expect(back.routine).toEqual([
      { exerciseId: "a", name: "A", sets: 20 },
      { exerciseId: "b", name: "B", sets: 1 },
    ]);
  });

  it("ignores malformed optional fields (window/minRest/intensity)", () => {
    const payload = JSON.stringify({
      name: "Solo core",
      intensity: 5, // not a string → ignored
      window: { start: "x", end: 10 }, // not both numbers → ignored
      minRest: "no", // ignored
      routine: [{ exerciseId: "abs", name: "Abs", sets: 3 }],
    });
    const back = parseSharedRoutine(payload)!;
    expect(back).toEqual({ name: "Solo core", routine: [{ exerciseId: "abs", name: "Abs", sets: 3 }] });
  });
});
