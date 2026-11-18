import { describe, expect, test } from "vitest";
import { readingAge } from "../scripts/reading-age.mjs";
import { styleFaults } from "../scripts/word-style.mjs";
import { COMPANY_ANSWER_EXAMPLES, COMPANY_ANSWER_STYLE } from "./assistantKnowledge";

/**
 * How Ask Hakken writes to the company's own people (docs/developer/writing-guide.md). On 18 November 2026 its answers
 * on Search Console's Countries and devices and Demand by Classification had every figure right and read like reports:
 * headings, "CTR", "-5.2%". The style it's told is held here, and its good examples to the screens' own word checks, so
 * the model is never shown a line a screen would be refused.
 */
describe("Ask Hakken's written style", () => {
  test("its good examples pass the screens' word checks and read at 14 or under", () => {
    for (const example of COMPANY_ANSWER_EXAMPLES) {
      expect(styleFaults(example), example).toEqual([]);
      expect(readingAge(example), example).toBeLessThanOrEqual(14);
      expect(COMPANY_ANSWER_STYLE).toContain(example);
    }
  });

  test("it says the rules the writing guide's checklist holds", () => {
    for (const rule of [/No headings/, /reading age of 14/, /Never join two ideas with a colon, a semicolon or a dash/, /Name the dates/, /Never a signed figure/, /Never "CTR"/, /Never "our" or "we"/, /Never the system's words/, /Never "that country"/, /tell them apart by their address/, /Never call a part the whole/]) {
      expect(COMPANY_ANSWER_STYLE).toMatch(rule);
    }
  });
});
