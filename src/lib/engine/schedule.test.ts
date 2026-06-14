import { describe, it, expect } from "vitest";
import { createDayPlan, decline, markDone, snooze } from "./schedule";
import { at } from "./time";
import type { Block, Settings } from "./types";

const settings: Settings = {
  workWindow: { start: at(9), end: at(18) }, // 09:00–18:00
  minRest: 30,
  avoidWindows: [{ start: at(13), end: at(14) }], // lunch
};

const noLunch: Settings = { ...settings, avoidWindows: [] };

/** Scheduled (placed) times, ascending. Skips unscheduled and skipped blocks. */
function scheduledTimes(blocks: Block[]): number[] {
  return blocks
    .filter((b) => b.status !== "skipped" && b.time >= 0)
    .map((b) => b.time)
    .sort((a, b) => a - b);
}

describe("createDayPlan", () => {
  it("schedules every set within the work window", () => {
    const routine = [
      { exerciseId: "pullups", name: "Dominadas", sets: 3 },
      { exerciseId: "dips", name: "Fondos", sets: 3 },
    ];
    const { blocks, warnings } = createDayPlan(routine, settings, at(9));

    expect(blocks).toHaveLength(6);
    expect(warnings).toHaveLength(0);
    for (const b of blocks) {
      expect(b.time).toBeGreaterThanOrEqual(settings.workWindow.start);
      expect(b.time).toBeLessThan(settings.workWindow.end);
    }
  });

  it("never schedules two blocks closer than minRest", () => {
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 6 }];
    const { blocks } = createDayPlan(routine, settings, at(9));
    const times = scheduledTimes(blocks);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(settings.minRest);
    }
  });

  it("keeps blocks out of the lunch window", () => {
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 8 }];
    const { blocks } = createDayPlan(routine, settings, at(9));
    for (const b of blocks) {
      if (b.time < 0) continue;
      const inLunch = b.time >= at(13) && b.time < at(14);
      expect(inLunch).toBe(false);
    }
  });

  it("spreads blocks evenly across the day", () => {
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 4 }];
    const { blocks } = createDayPlan(routine, noLunch, at(9));
    const times = scheduledTimes(blocks);
    // span 540 min / 4 blocks -> 135 min spacing
    expect(times[0]).toBe(at(9));
    expect(times[1] - times[0]).toBe(135);
    expect(times[2] - times[1]).toBe(135);
  });

  it("interleaves exercises instead of clustering them", () => {
    const routine = [
      { exerciseId: "A", name: "A", sets: 2 },
      { exerciseId: "B", name: "B", sets: 2 },
    ];
    const { blocks } = createDayPlan(routine, noLunch, at(9));
    const order = blocks
      .filter((b) => b.time >= 0)
      .sort((a, b) => a.time - b.time)
      .map((b) => b.exerciseId);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).not.toBe(order[i - 1]);
    }
  });
});

describe("overflow", () => {
  it("warns and leaves blocks unscheduled when the day is too full", () => {
    const tight: Settings = {
      workWindow: { start: at(9), end: at(10) }, // 60 minutes
      minRest: 30,
      avoidWindows: [],
    };
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 5 }];
    const { blocks, warnings } = createDayPlan(routine, tight, at(9));

    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("overflow");
    expect(blocks.filter((b) => b.time < 0).length).toBeGreaterThan(0);
  });
});

describe("decline (ahora no puedo)", () => {
  it("moves the declined set later and gives its slot to another block", () => {
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 3 }];
    const first = createDayPlan(routine, noLunch, at(9));
    const firstBlock = [...first.blocks].sort((a, b) => a.time - b.time)[0];
    const originalTime = firstBlock.time;

    const { blocks } = decline(first.blocks, firstBlock.id, noLunch, at(9));
    const declined = blocks.find((b) => b.id === firstBlock.id)!;
    const earliest = scheduledTimes(blocks)[0];

    expect(declined.time).toBeGreaterThan(originalTime);
    expect(earliest).toBe(originalTime);
    expect(blocks.find((b) => b.time === earliest)!.id).not.toBe(firstBlock.id);
  });
});

describe("markDone", () => {
  it("fixes the done block and reschedules the rest after it", () => {
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 3 }];
    const first = createDayPlan(routine, noLunch, at(9));
    const target = [...first.blocks].sort((a, b) => a.time - b.time)[0];

    const { blocks } = markDone(first.blocks, target.id, noLunch, at(9, 30));
    const done = blocks.find((b) => b.id === target.id)!;

    expect(done.status).toBe("done");
    expect(done.time).toBe(at(9, 30));
    for (const b of blocks.filter((x) => x.status === "pending")) {
      expect(b.time - done.time).toBeGreaterThanOrEqual(noLunch.minRest);
    }
  });
});

describe("snooze", () => {
  it("does not schedule the snoozed block before its snooze time", () => {
    const routine = [{ exerciseId: "pullups", name: "Dominadas", sets: 3 }];
    const first = createDayPlan(routine, noLunch, at(9));
    const target = [...first.blocks].sort((a, b) => a.time - b.time)[0];

    const { blocks } = snooze(first.blocks, target.id, 90, noLunch, at(9));
    const snoozed = blocks.find((b) => b.id === target.id)!;
    expect(snoozed.time).toBeGreaterThanOrEqual(at(9) + 90);
  });
});
