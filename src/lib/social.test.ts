import { describe, it, expect } from "vitest";
import { currentSeasonId } from "./social";

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
