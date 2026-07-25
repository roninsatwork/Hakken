import { describe, expect, test } from "vitest";
import {
  combineGradeSamples,
  parseGradeVerdict,
  selectGraderModel,
} from "./agentEvalGradingService";

describe("choosing a grader", () => {
  test("prefers a model other than the one under test", () => {
    // The eval used to generate an answer and grade it with the same model —
    // marking its own homework. Models favour their own output, so that measured
    // self-consistency rather than correctness.
    const grader = selectGraderModel({
      targetModelId: "model-a",
      enabledModelIds: ["model-a", "model-b"],
    });
    expect(grader).toEqual({ modelId: "model-b", independent: true });
  });

  test("uses an explicitly configured grader when it is available", () => {
    const grader = selectGraderModel({
      targetModelId: "model-a",
      enabledModelIds: ["model-a", "model-b", "model-c"],
      preferredGraderModelId: "model-c",
    });
    expect(grader).toEqual({ modelId: "model-c", independent: true });
  });

  test("ignores a configured grader that is the model under test", () => {
    const grader = selectGraderModel({
      targetModelId: "model-a",
      enabledModelIds: ["model-a", "model-b"],
      preferredGraderModelId: "model-a",
    });
    expect(grader.modelId).toBe("model-b");
  });

  test("ignores a configured grader that is not enabled", () => {
    const grader = selectGraderModel({
      targetModelId: "model-a",
      enabledModelIds: ["model-a", "model-b"],
      preferredGraderModelId: "model-z",
    });
    expect(grader.modelId).toBe("model-b");
  });

  test("says so when it cannot grade independently", () => {
    // A deployment with one enabled model has no alternative. The honest answer
    // is a weaker grade that reports itself, not a refusal and not a pretence.
    const grader = selectGraderModel({
      targetModelId: "model-a",
      enabledModelIds: ["model-a"],
    });
    expect(grader).toEqual({ modelId: "model-a", independent: false });
  });
});

describe("reading a grade", () => {
  test("accepts a well-formed verdict", () => {
    expect(parseGradeVerdict('{"pass": true, "reason": "Met the rubric.", "confidence": 0.9}'))
      .toEqual({ pass: true, reason: "Met the rubric.", confidence: 0.9 });
  });

  test("finds the verdict inside surrounding prose", () => {
    expect(parseGradeVerdict('Here is my grade:\n{"pass": false, "reason": "Missed the citation."}').pass)
      .toBe(false);
  });

  test("fails rather than passes when the grade cannot be read", () => {
    // This gates whether an agent goes live, so an unreadable grade is not
    // evidence of anything and must never resolve to a pass.
    expect(parseGradeVerdict("").pass).toBe(false);
    expect(parseGradeVerdict("looks fine to me").pass).toBe(false);
    expect(parseGradeVerdict("{not json}").pass).toBe(false);
    expect(parseGradeVerdict("[1,2,3]").pass).toBe(false);
  });

  test("does not guess at a near-miss verdict", () => {
    // A grader replying "true" or 1 has not answered the contract. Interpreting
    // its intent is how a wrong agent ships.
    expect(parseGradeVerdict('{"pass": "true", "reason": "yes"}').pass).toBe(false);
    expect(parseGradeVerdict('{"pass": 1, "reason": "yes"}').pass).toBe(false);
  });

  test("always carries a reason", () => {
    expect(parseGradeVerdict('{"pass": true}').reason).toBe("No grading reason provided.");
    expect(parseGradeVerdict('{"pass": true, "reason": "  "}').reason).toBe("No grading reason provided.");
  });
});

describe("combining repeated samples", () => {
  test("passes only when every sample passed", () => {
    // Deliberately strict: this decides whether an agent goes live, and one that
    // passes two times in three fails one conversation in three.
    expect(combineGradeSamples([
      { pass: true, reason: "ok" },
      { pass: true, reason: "ok" },
    ]).pass).toBe(true);

    expect(combineGradeSamples([
      { pass: true, reason: "ok" },
      { pass: false, reason: "missed the citation" },
      { pass: true, reason: "ok" },
    ]).pass).toBe(false);
  });

  test("reports how many samples failed and why", () => {
    const result = combineGradeSamples([
      { pass: false, reason: "missed the citation" },
      { pass: true, reason: "ok" },
    ]);
    expect(result.reason).toContain("1 of 2");
    expect(result.reason).toContain("missed the citation");
  });

  test("no samples is a failure, not a pass", () => {
    expect(combineGradeSamples([]).pass).toBe(false);
  });
});
