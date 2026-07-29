import { describe, expect, it } from "vitest";
import {
  classifyLogEntry,
  countFailureKeys,
  groupLogsByRun,
  matchesLogFilter,
  type LogEntryLike,
} from "./agentLogGroupingService";

function entry(overrides: Partial<LogEntryLike> & { _id: string }): LogEntryLike {
  return {
    interactionType: "LLM SYNTHESIS",
    outcome: "SUCCESS",
    createdAt: 1_000,
    ...overrides,
  };
}

describe("classifyLogEntry", () => {
  it("calls a failure a problem whatever it was doing at the time", () => {
    // Somebody filtering for problems wants the failed tool call, not a tidy
    // taxonomy that files it under tools.
    expect(classifyLogEntry({ interactionType: "TOOL DISPATCH: property_search", outcome: "FAILED" }))
      .toBe("PROBLEM");
    expect(classifyLogEntry({ interactionType: "LLM SYNTHESIS", outcome: "FAILED" })).toBe("PROBLEM");
  });

  it("separates reaching for a tool from thinking", () => {
    expect(classifyLogEntry({ interactionType: "TOOL DISPATCH: property_search", outcome: "SUCCESS" }))
      .toBe("TOOL");
    expect(classifyLogEntry({ interactionType: "TOOL AWAITING APPROVAL: send_email", outcome: "UNKNOWN" }))
      .toBe("TOOL");
    expect(classifyLogEntry({ interactionType: "LLM SYNTHESIS", outcome: "SUCCESS" })).toBe("THINKING");
  });

  it("does not force an unfamiliar entry into a category it does not fit", () => {
    expect(classifyLogEntry({ interactionType: "MCP PROXY: get_inbox", outcome: "SUCCESS" })).toBe("OTHER");
  });
});

describe("matchesLogFilter", () => {
  const failedTool = { interactionType: "TOOL DISPATCH: property_search", outcome: "FAILED" };
  const workingTool = { interactionType: "TOOL DISPATCH: property_search", outcome: "SUCCESS" };
  const thinking = { interactionType: "LLM SYNTHESIS", outcome: "SUCCESS" };

  it("shows everything when nothing is filtered", () => {
    expect(matchesLogFilter(failedTool, "ALL")).toBe(true);
    expect(matchesLogFilter(thinking, "ALL")).toBe(true);
  });

  it("shows only what the reader asked for", () => {
    expect(matchesLogFilter(thinking, "THINKING")).toBe(true);
    expect(matchesLogFilter(workingTool, "THINKING")).toBe(false);

    expect(matchesLogFilter(workingTool, "TOOLS")).toBe(true);
    expect(matchesLogFilter(thinking, "TOOLS")).toBe(false);

    expect(matchesLogFilter(failedTool, "PROBLEMS")).toBe(true);
    expect(matchesLogFilter(workingTool, "PROBLEMS")).toBe(false);
  });

  it("does not list a failed tool call under working tools", () => {
    expect(matchesLogFilter(failedTool, "TOOLS")).toBe(false);
  });
});

describe("groupLogsByRun", () => {
  it("gathers the entries of one job together", () => {
    const groups = groupLogsByRun([
      entry({ _id: "a", runId: "run_1", createdAt: 100 }),
      entry({ _id: "b", runId: "run_2", createdAt: 200 }),
      entry({ _id: "c", runId: "run_1", createdAt: 300 }),
    ]);

    expect(groups).toHaveLength(2);
    const runOne = groups.find((group) => group.runId === "run_1")!;
    expect(runOne.entries.map((item) => item._id)).toEqual(["a", "c"]);
  });

  it("puts the most recent job first", () => {
    const groups = groupLogsByRun([
      entry({ _id: "old", runId: "run_old", createdAt: 100 }),
      entry({ _id: "new", runId: "run_new", createdAt: 900 }),
    ]);

    expect(groups.map((group) => group.runId)).toEqual(["run_new", "run_old"]);
  });

  it("reads a job's own entries in the order they happened", () => {
    const groups = groupLogsByRun([
      entry({ _id: "third", runId: "run_1", createdAt: 300 }),
      entry({ _id: "first", runId: "run_1", createdAt: 100 }),
      entry({ _id: "second", runId: "run_1", createdAt: 200 }),
    ]);

    expect(groups[0].entries.map((item) => item._id)).toEqual(["first", "second", "third"]);
  });

  it("does not invent a job out of entries that never had one", () => {
    // A workflow step and a scheduled report are separate pieces of work.
    // Lumping them into one bucket would claim they were the same job.
    const groups = groupLogsByRun([
      entry({ _id: "a", createdAt: 100 }),
      entry({ _id: "b", createdAt: 200 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.runId === undefined)).toBe(true);
  });

  it("records when a job started and when it was last heard from", () => {
    const groups = groupLogsByRun([
      entry({ _id: "a", runId: "run_1", createdAt: 100 }),
      entry({ _id: "b", runId: "run_1", createdAt: 900 }),
    ]);

    expect(groups[0].startedAt).toBe(100);
    expect(groups[0].lastAt).toBe(900);
  });

  it("returns nothing for an empty stream", () => {
    expect(groupLogsByRun([])).toEqual([]);
  });
});

describe("countFailureKeys", () => {
  it("counts how often each failure has happened", () => {
    const counts = countFailureKeys([
      entry({ _id: "a", outcome: "FAILED", failureKey: "search timed out" }),
      entry({ _id: "b", outcome: "FAILED", failureKey: "search timed out" }),
      entry({ _id: "c", outcome: "FAILED", failureKey: "model refused" }),
    ]);

    expect(counts).toEqual({ "search timed out": 2, "model refused": 1 });
  });

  it("counts only failures", () => {
    const counts = countFailureKeys([
      entry({ _id: "a", outcome: "SUCCESS", failureKey: "search timed out" }),
      entry({ _id: "b", outcome: "UNKNOWN" }),
    ]);

    expect(counts).toEqual({});
  });
});
