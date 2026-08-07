import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  bucketRunsByDay,
  classifyRun,
  countRiskMix,
  dayKey,
  isRangeDays,
  median,
  rankBusiestSystems,
  runsPerDay,
  summariseOversight,
  summariseSideEffects,
} from "./governanceActivityService";

const NOW = Date.UTC(2026, 7, 6, 12, 0, 0);

const run = (id: string, startedAt: number, status: string) => ({ id, startedAt, status });

describe("what became of a run", () => {
  test("a run nobody had to touch finished on its own", () => {
    expect(classifyRun("SUCCESS", false)).toBe("FINISHED");
  });

  test("a run a person decided on is oversight, whatever its final status says", () => {
    // The status a run ends on cannot carry this: a run that parked on an
    // approval and was then let through ends as a success like any other.
    expect(classifyRun("SUCCESS", true)).toBe("WAITED");
  });

  test("a failure a person approved is still a failure", () => {
    // Colouring this as oversight would dress a fault up as a control working.
    expect(classifyRun("FAILED", true)).toBe("UNFINISHED");
  });

  test("cancelled and failed both answer no to did it do the thing", () => {
    expect(classifyRun("CANCELLED", false)).toBe("UNFINISHED");
    expect(classifyRun("FAILED", false)).toBe("UNFINISHED");
  });

  test("a run still going is not counted yet", () => {
    expect(classifyRun("RUNNING", false)).toBe("IN_FLIGHT");
    expect(classifyRun("QUEUED", false)).toBe("IN_FLIGHT");
  });
});

describe("runs per day", () => {
  test("quiet days are emitted as zeroes rather than skipped", () => {
    // A chart that omits its quiet days draws a weekend as though it never
    // happened, and the shape it shows is one the estate never had.
    const buckets = bucketRunsByDay([run("a", NOW, "SUCCESS")], new Set(), NOW, 7);

    expect(buckets).toHaveLength(7);
    expect(buckets.every((bucket) => typeof bucket.date === "string")).toBe(true);
    expect(buckets.at(-1)).toEqual({ date: dayKey(NOW), finished: 1, waited: 0, unfinished: 0 });
  });

  test("the last bucket is the day the reader is having", () => {
    const buckets = bucketRunsByDay([], new Set(), NOW, 30);

    expect(buckets.at(-1)?.date).toBe(dayKey(NOW));
    expect(buckets.at(0)?.date).toBe(dayKey(NOW - 29 * DAY_MS));
  });

  test("runs land on the day they started", () => {
    const buckets = bucketRunsByDay(
      [run("a", NOW - 2 * DAY_MS, "SUCCESS"), run("b", NOW, "FAILED"), run("c", NOW, "SUCCESS")],
      new Set(["c"]),
      NOW,
      7,
    );

    expect(buckets.at(-3)?.finished).toBe(1);
    expect(buckets.at(-1)).toEqual({ date: dayKey(NOW), finished: 0, waited: 1, unfinished: 1 });
  });

  test("runs outside the window are ignored rather than piled onto the first day", () => {
    const buckets = bucketRunsByDay([run("old", NOW - 40 * DAY_MS, "SUCCESS")], new Set(), NOW, 7);

    expect(buckets.every((bucket) => bucket.finished === 0)).toBe(true);
  });

  test("a run still going leaves no column behind", () => {
    // Otherwise today's bar sags and recovers on every refresh.
    const buckets = bucketRunsByDay([run("a", NOW, "RUNNING")], new Set(), NOW, 7);

    expect(buckets.at(-1)).toEqual({ date: dayKey(NOW), finished: 0, waited: 0, unfinished: 0 });
  });
});

describe("what it was allowed to touch", () => {
  test("counts each kind and the reassuring share", () => {
    const summary = summariseSideEffects(["READ", "READ", "READ", "WRITE", "EXTERNAL", "DESTRUCTIVE"]);

    expect(summary).toEqual({
      read: 3,
      write: 1,
      external: 1,
      destructive: 1,
      total: 6,
      readShare: 50,
    });
  });

  test("nothing done is not nought percent read-only", () => {
    // That figure reads as an accusation against an estate that has done nothing.
    expect(summariseSideEffects([]).readShare).toBe(100);
  });
});

describe("whether oversight is real or ornamental", () => {
  const minutes = (count: number) => count * 60 * 1000;

  test("how long a decision took is the part that says a person is there", () => {
    const summary = summariseOversight([
      { status: "APPROVED", requestedAt: NOW, reviewedAt: NOW + minutes(2) },
      { status: "REJECTED", requestedAt: NOW, reviewedAt: NOW + minutes(6) },
      { status: "PENDING", requestedAt: NOW },
    ]);

    expect(summary).toEqual({
      decided: 2,
      approved: 1,
      refused: 1,
      waiting: 1,
      medianMinutes: 4,
    });
  });

  test("expired approvals are not decisions", () => {
    // Nobody answered is a different fact about the platform from somebody
    // decided against it, and counting them together hides a queue being ignored.
    const summary = summariseOversight([{ status: "EXPIRED", requestedAt: NOW, reviewedAt: NOW }]);

    expect(summary.decided).toBe(0);
    expect(summary.medianMinutes).toBeNull();
  });

  test("nobody has answered one yet", () => {
    expect(summariseOversight([]).medianMinutes).toBeNull();
  });
});

describe("median", () => {
  test("averages the middle pair on an even count", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  test("nothing has no middle", () => {
    expect(median([])).toBeNull();
  });
});

describe("which systems are actually running", () => {
  const systems = [
    { id: "a", name: "Research agent", risk: "UNRATED" },
    { id: "b", name: "Email assistant", risk: "HIGH" },
    { id: "c", name: "Dormant agent", risk: "LOW" },
  ];

  test("busiest first, and the idle left off", () => {
    const ranked = rankBusiestSystems(systems, new Map([["a", 12], ["b", 40]]));

    expect(ranked.map((system) => system.id)).toEqual(["b", "a"]);
    expect(ranked[0].runs).toBe(40);
  });

  test("the rating travels with the count", () => {
    // Unrated and busy is urgent in a way unrated and dormant is not, and the
    // two facts were two screens apart.
    const ranked = rankBusiestSystems(systems, new Map([["a", 5]]));

    expect(ranked[0].risk).toBe("UNRATED");
  });

  test("a tie is broken by name rather than by insertion order", () => {
    const ranked = rankBusiestSystems(systems, new Map([["a", 5], ["b", 5]]));

    expect(ranked.map((system) => system.name)).toEqual(["Email assistant", "Research agent"]);
  });

  test("only the busiest few", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      id: `id-${index}`,
      name: `Agent ${index}`,
      risk: "LOW",
    }));
    const counts = new Map(many.map((system, index) => [system.id, index + 1]));

    expect(rankBusiestSystems(many, counts)).toHaveLength(5);
  });
});

describe("the estate by rating", () => {
  test("counts every rating including the absent one", () => {
    expect(countRiskMix(["HIGH", "UNRATED", "UNRATED", "LOW"])).toEqual({
      high: 1,
      medium: 0,
      low: 1,
      unrated: 2,
    });
  });
});

describe("the headline figure at a rate", () => {
  test("runs a day to one decimal", () => {
    expect(runsPerDay(1284, 30)).toBe(42.8);
  });

  test("no days is no rate rather than a division by nought", () => {
    expect(runsPerDay(10, 0)).toBe(0);
  });
});

describe("the ranges the screen offers", () => {
  test("admits the three it draws", () => {
    expect(isRangeDays(7)).toBe(true);
    expect(isRangeDays(30)).toBe(true);
    expect(isRangeDays(90)).toBe(true);
  });

  test("refuses anything else, so a hand-typed range cannot widen the scan", () => {
    expect(isRangeDays(3650)).toBe(false);
  });
});
