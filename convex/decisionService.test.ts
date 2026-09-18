import { describe, expect, test } from "vitest";
import {
  answerText,
  certaintyFromConfidence,
  certaintyFromYesNoProbability,
  certaintyOf,
  certaintyWords,
  confidenceFromProbabilities,
  outcomeFor,
  resolveDecisionMode,
  verdictFor,
  type CertaintyBand,
  type DecisionMode,
  type DecisionStakes,
} from "./decisionService";

describe("certainty bands", () => {
  test("a yes/no is as sure at 0.08 as at 0.92, and not sure near the middle", () => {
    expect(certaintyFromYesNoProbability(0.92)).toBe("SURE");
    expect(certaintyFromYesNoProbability(0.08)).toBe("SURE");
    expect(certaintyFromYesNoProbability(0.75)).toBe("FAIRLY_SURE");
    expect(certaintyFromYesNoProbability(0.25)).toBe("FAIRLY_SURE");
    expect(certaintyFromYesNoProbability(0.6)).toBe("NOT_SURE");
    expect(certaintyFromYesNoProbability(0.5)).toBe("NOT_SURE");
  });

  test("a text model's estimate is cut higher: the same number is a band lower", () => {
    expect(certaintyFromYesNoProbability(0.9, "TEXT_MODEL")).toBe("FAIRLY_SURE");
    expect(certaintyFromYesNoProbability(0.95, "TEXT_MODEL")).toBe("SURE");
    expect(certaintyFromConfidence(0.7, "TEXT_MODEL")).toBe("FAIRLY_SURE");
    expect(certaintyFromConfidence(0.5, "TEXT_MODEL")).toBe("NOT_SURE");
    expect(certaintyOf({ kind: "yes-no", yes: true, probability: 0.9 }, "TEXT_MODEL")).toBe("FAIRLY_SURE");
    expect(certaintyOf({ kind: "yes-no", yes: true, probability: 0.9 })).toBe("SURE");
  });

  test("a pick-one or score uses the confidence as it is", () => {
    expect(certaintyFromConfidence(0.7)).toBe("SURE");
    expect(certaintyFromConfidence(0.4)).toBe("FAIRLY_SURE");
    expect(certaintyFromConfidence(0.39)).toBe("NOT_SURE");
    expect(certaintyFromConfidence(1.4)).toBe("SURE");
    expect(certaintyFromConfidence(-1)).toBe("NOT_SURE");
  });

  test("a spread's confidence is the gap between the top two options", () => {
    expect(confidenceFromProbabilities({ a: 0.84, b: 0.15, c: 0.01 })).toBeCloseTo(0.69);
    expect(confidenceFromProbabilities({ a: 0.5, b: 0.5 })).toBe(0);
    expect(confidenceFromProbabilities({ a: 1 })).toBe(1);
    expect(confidenceFromProbabilities({})).toBe(0);
  });

  test("a rule's answer has no certainty", () => {
    expect(certaintyOf({ kind: "yes-no", yes: true })).toBeNull();
    expect(certaintyOf({ kind: "pick-one", choice: "spam" })).toBeNull();
    expect(certaintyOf({ kind: "yes-no", yes: true, probability: 0.95 })).toBe("SURE");
    expect(certaintyOf({ kind: "pick-one", choice: "spam", probabilities: { spam: 0.9, other: 0.1 } })).toBe("SURE");
  });

  test("the three words", () => {
    expect(certaintyWords("SURE")).toBe("sure");
    expect(certaintyWords("FAIRLY_SURE")).toBe("fairly sure");
    expect(certaintyWords("NOT_SURE")).toBe("not sure");
  });
});

describe("verdict table", () => {
  const bands: CertaintyBand[] = ["SURE", "FAIRLY_SURE", "NOT_SURE"];
  const stakesLevels: DecisionStakes[] = ["LOW", "HIGH"];

  test("OFF, or a rule answering, is always the rule's verdict", () => {
    for (const band of [...bands, null]) {
      for (const stakes of stakesLevels) {
        expect(verdictFor({ mode: "OFF", certainty: band, stakes, source: "TYPESAFE" })).toBe("RULES");
        expect(verdictFor({ mode: "ACT", certainty: band, stakes, source: "RULES" })).toBe("RULES");
      }
    }
  });

  test("ASK_A_PERSON never acts, however sure", () => {
    for (const band of bands) {
      for (const stakes of stakesLevels) {
        expect(verdictFor({ mode: "ASK_A_PERSON", certainty: band, stakes, source: "TYPESAFE" })).toBe("ASK_A_PERSON");
      }
    }
  });

  test("ACT: sure acts; fairly sure acts only on low stakes; not sure never acts", () => {
    const cell = (certainty: CertaintyBand, stakes: DecisionStakes) =>
      verdictFor({ mode: "ACT", certainty, stakes, source: "TYPESAFE" });
    expect(cell("SURE", "LOW")).toBe("ACT");
    expect(cell("SURE", "HIGH")).toBe("ACT");
    expect(cell("FAIRLY_SURE", "LOW")).toBe("ACT");
    expect(cell("FAIRLY_SURE", "HIGH")).toBe("ASK_A_PERSON");
    expect(cell("NOT_SURE", "LOW")).toBe("ASK_A_PERSON");
    expect(cell("NOT_SURE", "HIGH")).toBe("ASK_A_PERSON");
  });

  test("an answer that changes nothing is recorded, not acted", () => {
    expect(outcomeFor({ verdict: "ACT", actionable: true })).toBe("ACTED");
    expect(outcomeFor({ verdict: "ACT", actionable: false })).toBe("RECORDED");
    expect(outcomeFor({ verdict: "ASK_A_PERSON", actionable: true })).toBe("HANDED_TO_PERSON");
    expect(outcomeFor({ verdict: "ASK_A_PERSON", actionable: false })).toBe("RECORDED");
    expect(outcomeFor({ verdict: "RULES", actionable: true })).toBe("RECORDED");
  });
});

describe("mode resolution and answer text", () => {
  test("company beats global beats default", () => {
    const resolve = (companyMode: DecisionMode | null, globalMode: DecisionMode | null) =>
      resolveDecisionMode({ companyMode, globalMode, defaultMode: "OFF" });
    expect(resolve(null, null)).toBe("OFF");
    expect(resolve(null, "ACT")).toBe("ACT");
    expect(resolve("ASK_A_PERSON", "ACT")).toBe("ASK_A_PERSON");
  });

  test("answer text is short and stable", () => {
    expect(answerText({ kind: "yes-no", yes: true })).toBe("yes");
    expect(answerText({ kind: "yes-no", yes: false })).toBe("no");
    expect(answerText({ kind: "pick-one", choice: "newsletter" })).toBe("newsletter");
    expect(answerText({ kind: "score", score: 1.456 })).toBe("1.46");
  });
});
