import { describe, it, expect } from "vitest";
import {
  computeAdherence,
  currentSeasonId,
  parseSharedRoutine,
  serializeDayType,
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
