import { describe, expect, test } from "vitest";

import { gradeRehearsalToolPlan } from "./rehearsalEvalService";

describe("gradeRehearsalToolPlan", () => {
  const plan = JSON.stringify([
    { handlerMapping: "knowledge.search" },
    { handlerMapping: "notification.send" },
  ]);

  test("passes when every expected handler was performed or rehearsed", () => {
    const grade = gradeRehearsalToolPlan({
      expectedToolPlanJson: plan,
      toolCalls: [
        { handlerMapping: "knowledge.search", status: "SUCCESS" },   // a read, executed
        { handlerMapping: "notification.send", status: "REHEARSED" }, // a write, recorded
      ],
      runStatus: "SUCCESS",
    });
    expect(grade.status).toBe("PASSED");
    expect(grade.missing).toEqual([]);
  });

  test("fails naming exactly what was never called", () => {
    const grade = gradeRehearsalToolPlan({
      expectedToolPlanJson: plan,
      toolCalls: [{ handlerMapping: "knowledge.search", status: "SUCCESS" }],
      runStatus: "SUCCESS",
    });
    expect(grade.status).toBe("FAILED");
    expect(grade.missing).toEqual(["notification.send"]);
    expect(grade.failures.join(" ")).toContain("notification.send");
  });

  test("a denied or failed call does not count as performed", () => {
    // The agent asking is not the agent doing: a call the platform refused
    // cannot satisfy the plan.
    const grade = gradeRehearsalToolPlan({
      expectedToolPlanJson: plan,
      toolCalls: [
        { handlerMapping: "knowledge.search", status: "DENIED" },
        { handlerMapping: "notification.send", status: "FAILED" },
      ],
      runStatus: "SUCCESS",
    });
    expect(grade.status).toBe("FAILED");
    expect(grade.missing).toEqual(["knowledge.search", "notification.send"]);
  });

  test("a crashed drill fails regardless of what it managed first", () => {
    const grade = gradeRehearsalToolPlan({
      expectedToolPlanJson: plan,
      toolCalls: [
        { handlerMapping: "knowledge.search", status: "SUCCESS" },
        { handlerMapping: "notification.send", status: "REHEARSED" },
      ],
      runStatus: "FAILED",
    });
    expect(grade.status).toBe("FAILED");
    expect(grade.failures.join(" ")).toContain("FAILED");
  });

  test("no expected plan grades only on the run completing", () => {
    expect(
      gradeRehearsalToolPlan({ expectedToolPlanJson: undefined, toolCalls: [], runStatus: "SUCCESS" }).status
    ).toBe("PASSED");
    // Junk in a hand-edited fixture reads as no plan, not a crash.
    expect(
      gradeRehearsalToolPlan({ expectedToolPlanJson: "not json", toolCalls: [], runStatus: "SUCCESS" }).status
    ).toBe("PASSED");
  });

  test("extra calls beyond the plan are not failures", () => {
    // The fixture names what must happen, not everything that may.
    const grade = gradeRehearsalToolPlan({
      expectedToolPlanJson: JSON.stringify([{ handlerMapping: "knowledge.search" }]),
      toolCalls: [
        { handlerMapping: "knowledge.search", status: "SUCCESS" },
        { handlerMapping: "web.scrape", status: "REHEARSED" },
      ],
      runStatus: "SUCCESS",
    });
    expect(grade.status).toBe("PASSED");
  });
});
