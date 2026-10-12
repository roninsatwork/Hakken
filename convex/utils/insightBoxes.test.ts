import { describe, expect, test } from "vitest";
import { BOXES, BOX_FORMAT, boxesForAssistant, boxesFrom, factsForBox, screensByRole } from "./insightBoxes";
import { fixedRulesFor } from "./insightBriefs";
import { factsByKey, type Fact } from "./insightFacts";

/**
 * Each screen's "What Hakken sees" box written by its specialist
 * (insightBoxes.ts; insights-one-voice-plan.md phase 4): from its own
 * discipline's figures, every one filled from a fact, nothing typed.
 */

const fact = (key: string, value: number, source: Fact["source"] = "analytics"): Fact => ({ key, value, unit: "count", source, label: key });
const FACTS = [
  fact("ai.ronins.co.uk.mentions.now", 12, "ai"), fact("ai.ronins.co.uk.mentions.year", 4, "ai"),
  fact("seo.ronins.co.uk.traffic.now", 900, "market"), fact("ga.conversions.90.now", 10),
  fact("sc.clicks.90.now", 300, "searchConsole"),
];

describe("a screen's box, written by its specialist", () => {
  test("each specialist writes its own screens, from its own discipline's figures", () => {
    expect(screensByRole().get("INSIGHTS_AI_VISIBILITY")).toEqual(["AI_SEARCH"]);
    expect(BOXES.LEADERBOARDS.role).toBe("INSIGHTS_MARKET");
    expect(factsForBox("AI_SEARCH", FACTS).map((entry) => entry.key)).toEqual(["ai.ronins.co.uk.mentions.now", "ai.ronins.co.uk.mentions.year", "seo.ronins.co.uk.traffic.now"]);
    expect(factsForBox("OPPORTUNITIES", FACTS).map((entry) => entry.key)).toEqual(["sc.clicks.90.now"]);
  });

  test("every figure is filled from its fact; a sentence typing a number or naming one not held is left out", () => {
    const boxes = boxesFrom({ boxes: [
      { screen: "AI_SEARCH", says: ["AI assistants named you [[ai.ronins.co.uk.mentions.now]] times, up from [[ai.ronins.co.uk.mentions.year]].", "That's 3 times as many.", "Rivals: [[ai.rival.mentions.now]]."] },
      { screen: "MEASUREMENT", says: ["Not asked."] },
    ] }, ["AI_SEARCH"], factsByKey(FACTS));
    expect(boxes).toEqual([{ screen: "AI_SEARCH", says: ["AI assistants named you 12 times, up from 4."] }]);
  });

  test("the writers carry its shape on their Instructions pages; Ask Hakken reads each box as written", () => {
    expect(fixedRulesFor("INSIGHTS_MARKET").map((rule) => rule.part)).toContain("boxes");
    expect(fixedRulesFor("INSIGHTS_EDITOR").map((rule) => rule.part)).not.toContain("boxes");
    expect(BOX_FORMAT).toMatch(/never type a number/);
    expect(boxesForAssistant([{ screen: "AI_SEARCH", says: ["Named 12 times.", "Up from 4."], role: "INSIGHTS_AI_VISIBILITY", week: "2026-10-12" }]).screens).toEqual([
      { screen: "/app/insights/ai-search", says: "Named 12 times. Up from 4.", written_by: "the AI visibility specialist, in the week of 2026-10-12" },
    ]);
  });
});
