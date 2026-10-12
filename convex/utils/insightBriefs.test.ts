import { describe, expect, test } from "vitest";
import { INSIGHTS_ROLES } from "./agentRoles";
import { EARLIER_BRIEFS, INSIGHT_BRIEFS, briefFor, fixedRulesFor } from "./insightBriefs";
import { FINDINGS_FORMAT, GROUND_RULES, STRATEGY_FORMAT } from "./insightTeam";

/**
 * Each Insights agent's job and brief, readable and refinable on its
 * Instructions page, with the fixed rules shown beside them (12 Oct 2026).
 */

describe("an Insights agent's brief", () => {
  test("every agent has a job, and every agent but the Editor a brief", () => {
    for (const role of INSIGHTS_ROLES) {
      expect(INSIGHT_BRIEFS[role].job.length).toBeGreaterThan(40);
      if (role !== "INSIGHTS_EDITOR") expect(INSIGHT_BRIEFS[role].brief.length).toBeGreaterThan(40);
    }
    expect(INSIGHT_BRIEFS.INSIGHTS_EDITOR.brief).toBe("");
  });

  test("the run uses the brief saved on the page, Hakken's own while it is blank", () => {
    expect(briefFor("INSIGHTS_SEARCH", "Look harder at local searches.")).toBe("Look harder at local searches.");
    expect(briefFor("INSIGHTS_SEARCH", "  ")).toBe(INSIGHT_BRIEFS.INSIGHTS_SEARCH.brief);
    expect(briefFor("INSIGHTS_SEARCH", undefined)).toBe(INSIGHT_BRIEFS.INSIGHTS_SEARCH.brief);
  });

  test("the Head of Strategy weighs last month as well as last year", () => {
    expect(INSIGHT_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY.brief).toMatch(/against the month before/);
    expect(INSIGHT_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY.brief).toMatch(/same period a year ago/);
    expect(EARLIER_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY).not.toContain(INSIGHT_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY.brief);
  });

  test("what stays fixed: the ground rules and the shape of each answer, never the thinking", () => {
    const strategy = fixedRulesFor("INSIGHTS_HEAD_OF_STRATEGY").map((rule) => rule.text);
    expect(strategy).toEqual(expect.arrayContaining([GROUND_RULES, FINDINGS_FORMAT, STRATEGY_FORMAT]));
    for (const text of strategy) expect(text).not.toContain("Connect findings that share one cause");
    expect(fixedRulesFor("INSIGHTS_EDITOR").map((rule) => rule.part)).toEqual(["editor"]);
    expect(fixedRulesFor("INSIGHTS_CONVERSION").map((rule) => rule.part)).toContain("review");
  });
});
