import { describe, expect, it } from "vitest";
import {
  buildWaterfall,
  describeStepKind,
  describeStepStatus,
  summariseWaterfall,
  type WaterfallStepInput,
} from "./jobWaterfall";

const RUN_START = 1_000_000;

function step(overrides: Partial<WaterfallStepInput> & { _id: string; startedAt: number }): WaterfallStepInput {
  return {
    kind: "MODEL",
    status: "SUCCESS",
    completedAt: overrides.startedAt,
    ...overrides,
  };
}

describe("buildWaterfall", () => {
  /**
   * The runtime stamps a step's start and end with the same instant, so a bar
   * drawn from those fields is always zero wide. The elapsed time is the gap
   * between one step finishing and the next.
   */
  it("charges the time between recordings to the step that earned it", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 1_000 }),
        step({ _id: "b", startedAt: RUN_START + 4_000 }),
        step({ _id: "c", startedAt: RUN_START + 10_000 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 10_000, now: RUN_START + 20_000 }
    );

    expect(rows.map((row) => row.durationMs)).toEqual([1_000, 3_000, 6_000]);
  });

  it("accounts for every second of the run, with nothing left over", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 900 }),
        step({ _id: "b", startedAt: RUN_START + 4_300 }),
        step({ _id: "c", startedAt: RUN_START + 31_400 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 31_400, now: RUN_START + 40_000 }
    );

    const total = rows.reduce((sum, row) => sum + row.durationMs, 0);
    expect(total).toBe(31_400);
  });

  it("lays the bars end to end without gaps or overlaps", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 2_000 }),
        step({ _id: "b", startedAt: RUN_START + 6_000 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 8_000, now: RUN_START + 8_000 }
    );

    expect(rows[0].offsetPercent).toBe(0);
    expect(rows[1].offsetPercent).toBeCloseTo(25, 5);
  });

  it("keeps a very fast step visible instead of drawing nothing", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 5 }),
        step({ _id: "b", startedAt: RUN_START + 60_000 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 60_000, now: RUN_START + 60_000 }
    );

    expect(rows[0].durationMs).toBe(5);
    expect(rows[0].widthPercent).toBeGreaterThan(0);
  });

  it("grows the step an unfinished run is stuck on rather than showing it as instant", () => {
    const rows = buildWaterfall(
      [step({ _id: "a", startedAt: RUN_START + 1_000, status: "RUNNING", completedAt: undefined })],
      { runStartedAt: RUN_START, runCompletedAt: undefined, now: RUN_START + 45_000 }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].durationMs).toBe(1_000);
    // The run window extends to now, so the single step occupies a small share
    // of a growing chart rather than the whole of a frozen one.
    expect(rows[0].widthPercent).toBeLessThan(10);
  });

  it("sorts by when the work happened, not by the order it arrived in", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "late", startedAt: RUN_START + 9_000 }),
        step({ _id: "early", startedAt: RUN_START + 1_000 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 9_000, now: RUN_START + 9_000 }
    );

    expect(rows.map((row) => row.id)).toEqual(["early", "late"]);
  });

  it("colours a step by what it was doing, and failure over everything", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 1_000, kind: "MODEL" }),
        step({ _id: "b", startedAt: RUN_START + 2_000, kind: "TOOL_CALL" }),
        step({ _id: "c", startedAt: RUN_START + 3_000, kind: "APPROVAL_REQUEST" }),
        step({ _id: "d", startedAt: RUN_START + 4_000, kind: "TOOL_CALL", status: "FAILED" }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 4_000, now: RUN_START + 4_000 }
    );

    expect(rows.map((row) => row.tone)).toEqual(["thinking", "tool", "waiting", "failed"]);
  });

  it("flags the step that dominated the run", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 900 }),
        step({ _id: "b", startedAt: RUN_START + 2_500 }),
        step({ _id: "slow", startedAt: RUN_START + 31_400, kind: "TOOL_CALL", status: "FAILED" }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 31_400, now: RUN_START + 31_400 }
    );

    expect(rows.filter((row) => row.isLongest).map((row) => row.id)).toEqual(["slow"]);
  });

  it("flags nothing when no single step dominated", () => {
    // Pointing at the largest of several similar steps draws the eye to nothing.
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 1_000 }),
        step({ _id: "b", startedAt: RUN_START + 2_100 }),
        step({ _id: "c", startedAt: RUN_START + 3_000 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 3_000, now: RUN_START + 3_000 }
    );

    expect(rows.some((row) => row.isLongest)).toBe(false);
  });

  it("returns nothing for a job with no steps rather than dividing by zero", () => {
    expect(buildWaterfall([], { runStartedAt: RUN_START, now: RUN_START })).toEqual([]);
  });

  it("does not draw a negative bar when a step predates the run it belongs to", () => {
    const rows = buildWaterfall(
      [step({ _id: "a", startedAt: RUN_START - 5_000 })],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 1_000, now: RUN_START + 1_000 }
    );

    expect(rows[0].offsetPercent).toBeGreaterThanOrEqual(0);
    expect(rows[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("summariseWaterfall", () => {
  it("says where the time went when one step dominated", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 900 }),
        step({ _id: "slow", startedAt: RUN_START + 31_400, kind: "TOOL_CALL", input: "property search", status: "FAILED" }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 31_400, now: RUN_START + 31_400 }
    );

    expect(summariseWaterfall(rows)).toBe(
      "97% of this job was spent on a step that then failed: used property search."
    );
  });

  it("stays quiet when there is no story to tell", () => {
    const rows = buildWaterfall(
      [
        step({ _id: "a", startedAt: RUN_START + 1_000 }),
        step({ _id: "b", startedAt: RUN_START + 2_000 }),
        step({ _id: "c", startedAt: RUN_START + 3_000 }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 3_000, now: RUN_START + 3_000 }
    );

    expect(summariseWaterfall(rows)).toBeUndefined();
  });
});

describe("describeStepStatus", () => {
  it("says how a step ended without naming the runtime's own state", () => {
    expect(describeStepStatus("SUCCESS")).toBe("Worked");
    expect(describeStepStatus("PENDING")).toBe("Not started");
    expect(describeStepStatus("SKIPPED")).toBe("Skipped");
  });

  it("passes an unrecognised status through rather than hiding it", () => {
    expect(describeStepStatus("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});

describe("describeStepKind", () => {
  it("says what a step was in ordinary words", () => {
    expect(describeStepKind("OBSERVE")).toBe("Read the request");
    expect(describeStepKind("PLAN")).toBe("Decided what to do");
    expect(describeStepKind("APPROVAL_REQUEST")).toBe("Waited for someone to approve");
    expect(describeStepKind("FINAL")).toBe("Wrote the answer");
  });

  it("names the tool when it knows it", () => {
    expect(describeStepKind("TOOL_CALL", "property search")).toBe("Used property search");
    expect(describeStepKind("TOOL_CALL")).toBe("Used a tool");
    expect(describeStepKind("TOOL_CALL", "   ")).toBe("Used a tool");
  });

  it("passes an unrecognised kind through rather than hiding it", () => {
    expect(describeStepKind("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
