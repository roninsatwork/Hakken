import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DECISIONS, getDecision, toDecisionAnswer } from "./decisionRegistry";

type CatalogueEntry = {
  name?: string;
  description?: string;
  rule?: string;
  answers?: Record<string, string>;
};

function readCatalogue(locale: "en" | "it"): Record<string, CatalogueEntry> {
  const file = path.join(process.cwd(), "messages", `${locale}.json`);
  const messages = JSON.parse(readFileSync(file, "utf8")) as { decisions?: { catalogue?: Record<string, CatalogueEntry> } };
  return messages.decisions?.catalogue ?? {};
}

/**
 * Every registered Decision must be complete: a key in the house shape, a
 * question TypeSafe will accept, and copy in both languages for every answer
 * it can give — because a screen that meets an answer with no words for it
 * prints the raw key, and the copy-catalogue guard forbids writing the
 * words into the screen instead.
 */
describe("decision registry", () => {
  const catalogues = { en: readCatalogue("en"), it: readCatalogue("it") };

  test("there is at least one Decision, and every key is unique and shaped area.what", () => {
    expect(DECISIONS.length).toBeGreaterThan(0);
    const keys = DECISIONS.map((decision) => decision.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z]+\.[a-z-]+$/);
  });

  test.each(DECISIONS.map((decision) => [decision.key, decision] as const))(
    "%s is complete in both languages",
    (_key, decision) => {
      expect(decision.name.trim().length).toBeGreaterThan(0);
      for (const locale of ["en", "it"] as const) {
        const entry = catalogues[locale][decision.copyKey];
        expect(entry, `${locale}: decisions.catalogue.${decision.copyKey}`).toBeDefined();
        expect(entry?.name?.trim().length).toBeGreaterThan(0);
        expect(entry?.description?.trim().length).toBeGreaterThan(0);
        expect(entry?.rule?.trim().length).toBeGreaterThan(0);

        const question = decision.question;
        const expectedAnswers =
          question.type === "noul" ? ["yes", "no"]
          : question.type === "choice" ? Object.keys(question.criteria)
          : [];
        for (const answer of expectedAnswers) {
          expect(entry?.answers?.[answer], `${locale}: ${decision.copyKey}.answers.${answer}`).toBeTruthy();
        }
      }
    },
  );

  test("every pick-one offers a way out when nothing fits, and every score has two levels", () => {
    for (const decision of DECISIONS) {
      if (decision.question.type === "choice") {
        expect(Object.keys(decision.question.criteria).length).toBeGreaterThanOrEqual(2);
        expect(decision.question.criteria).toHaveProperty("other");
      }
      if (decision.question.type === "score") {
        expect(decision.question.criteria.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("every Decision ships switched off", () => {
    for (const decision of DECISIONS) expect(decision.defaultMode).toBe("OFF");
  });

  test("describeAction answers for every option without throwing", () => {
    for (const decision of DECISIONS) {
      const question = decision.question;
      if (question.type === "noul") {
        expect(() => decision.describeAction({ kind: "yes-no", yes: true })).not.toThrow();
        expect(() => decision.describeAction({ kind: "yes-no", yes: false })).not.toThrow();
      } else if (question.type === "choice") {
        for (const choice of Object.keys(question.criteria)) {
          expect(() => decision.describeAction({ kind: "pick-one", choice })).not.toThrow();
        }
      }
    }
  });

  test("the mailbox message-kind Decision acts on skips and not on customers", () => {
    const decision = getDecision("mailbox.message-kind")!;
    expect(decision.describeAction({ kind: "pick-one", choice: "customer" })).toBeNull();
    expect(decision.describeAction({ kind: "pick-one", choice: "other" })).toBeNull();
    expect(decision.describeAction({ kind: "pick-one", choice: "spam" })).toMatch(/spam/);
    expect(decision.describeAction({ kind: "pick-one", choice: "newsletter" })).toMatch(/newsletter/);
  });

  test("wire answers become platform answers", () => {
    expect(toDecisionAnswer({ type: "noul", noul: 0.92 })).toEqual({ kind: "yes-no", yes: true, probability: 0.92 });
    expect(toDecisionAnswer({ type: "noul", noul: 0.3 })).toEqual({ kind: "yes-no", yes: false, probability: 0.3 });
    expect(toDecisionAnswer({ type: "choice", choice: "spam", probabilities: { spam: 0.9, other: 0.1 }, confidence: 0.8 }))
      .toEqual({ kind: "pick-one", choice: "spam", probabilities: { spam: 0.9, other: 0.1 } });
    expect(toDecisionAnswer({ type: "score", score: 1.4, legend: { "0": "a", "1": "b" }, probabilities: { "0": 0.6, "1": 0.4 }, confidence: 0.2 }))
      .toEqual({ kind: "score", score: 1.4, probabilities: { "0": 0.6, "1": 0.4 } });
  });
});
