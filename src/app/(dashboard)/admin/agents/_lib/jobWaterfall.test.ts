import { describe, expect, it } from "vitest";
import {
  buildWaterfall,
  describeStepKind,
  describeStepStatus,
  humaniseToolName,
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
        step({ _id: "slow", startedAt: RUN_START + 31_400, kind: "TOOL_CALL", toolName: "property search", status: "FAILED" }),
      ],
      { runStartedAt: RUN_START, runCompletedAt: RUN_START + 31_400, now: RUN_START + 31_400 }
    );

    expect(summariseWaterfall(rows)).toEqual({
      key: "waterfall.summaryFailed",
      share: 97,
      step: { key: "step.usedTool", params: { tool: "property search" } },
    });
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
  it("maps how a step ended to its catalogue key rather than the runtime's own state", () => {
    expect(describeStepStatus("SUCCESS")).toEqual({ key: "stepStatus.worked" });
    expect(describeStepStatus("PENDING")).toEqual({ key: "stepStatus.notStarted" });
    expect(describeStepStatus("SKIPPED")).toEqual({ key: "stepStatus.skipped" });
  });

  it("passes an unrecognised status through rather than hiding it", () => {
    expect(describeStepStatus("SOMETHING_NEW")).toEqual({
      key: "stepStatus.unknown",
      params: { status: "SOMETHING_NEW" },
    });
  });
});

describe("describeStepKind", () => {
  it("maps what a step was to its catalogue key", () => {
    expect(describeStepKind("OBSERVE")).toEqual({ key: "step.readRequest" });
    expect(describeStepKind("PLAN")).toEqual({ key: "step.decidedPlan" });
    expect(describeStepKind("APPROVAL_REQUEST")).toEqual({ key: "step.waitedApproval" });
    expect(describeStepKind("FINAL")).toEqual({ key: "step.wroteAnswer" });
  });

  it("names the tool when it knows it", () => {
    expect(describeStepKind("TOOL_CALL", undefined, "Apify")).toEqual({ key: "step.usedTool", params: { tool: "Apify" } });
    expect(describeStepKind("TOOL_RESULT", undefined, "Apify")).toEqual({ key: "step.readToolResult", params: { tool: "Apify" } });
    expect(describeStepKind("TOOL_CALL")).toEqual({ key: "step.usedSomeTool" });
    expect(describeStepKind("TOOL_CALL", undefined, "   ")).toEqual({ key: "step.usedSomeTool" });
    expect(describeStepKind("TOOL_RESULT")).toEqual({ key: "step.readResult" });
  });

  it("never labels a step with the arguments it was called with", () => {
    // The chart used to read `Used {"job":"jKpgGfgRfzrGgEM...`, because the call
    // step stores its arguments and the label was built from them. A reader
    // learned nothing about which tool had run.
    const argumentsJson = '{"job":"jKpgGfgRfzrGgEM","settings":"{}"}';

    expect(describeStepKind("TOOL_CALL", argumentsJson)).toEqual({ key: "step.usedSomeTool" });
    expect(describeStepKind("TOOL_CALL", argumentsJson, "Apify")).toEqual({ key: "step.usedTool", params: { tool: "Apify" } });
  });
});

describe("humaniseToolName", () => {
  it("turns a runtime tool name into something readable", () => {
    // Chosen tool names read better here than the routing keys they replaced:
    // "Run scraper job" rather than "Apify actor run".
    expect(humaniseToolName("run_scraper_job")).toBe("Run scraper job");
    expect(humaniseToolName("apify.actor.describe")).toBe("Apify actor describe");
    expect(humaniseToolName("search_knowledge")).toBe("Search knowledge");
  });

  it("gives back nothing when there is no name to read", () => {
    expect(humaniseToolName("   ")).toBe("");
  });

  it("passes an unrecognised kind through rather than hiding it", () => {
    expect(describeStepKind("SOMETHING_NEW")).toEqual({
      key: "step.unknown",
      params: { kind: "SOMETHING_NEW" },
    });
  });
});
