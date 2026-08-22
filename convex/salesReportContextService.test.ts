import { describe, expect, test } from "vitest";
import {
  buildReportQueryText,
  buildSalesReportGroundingContext,
  REPORT_KNOWLEDGE_MAX_CHARS,
  REPORT_MEMORY_MAX_CHARS,
} from "./salesReportContextService";

describe("sales report grounding context", () => {
  test("the retrieval query names the report's subjects, and a focus sharpens it", () => {
    const base = buildReportQueryText();
    expect(base).toContain("sales pipeline board report");

    const focused = buildReportQueryText("  the Meridian renewal  ");
    expect(focused).toContain("sales pipeline board report");
    expect(focused).toContain("the Meridian renewal");
    // Whitespace-only focus is no focus at all.
    expect(buildReportQueryText("   ")).toBe(base);
  });

  test("no grounding sources means no grounding block, not an empty labelled one", () => {
    expect(
      buildSalesReportGroundingContext({
        agentMemories: [],
        companyMemories: [],
        knowledgeChunks: [],
      })
    ).toBe("");
  });

  test("each source appears under its own label, carrying its content", () => {
    const grounding = buildSalesReportGroundingContext({
      agentMemories: ["The board asked for win-rate trend last quarter."],
      companyMemories: [{ title: "Pricing floor", content: "Never discount below 20%." }],
      knowledgeChunks: ["Enterprise playbook: multi-thread every deal above £50k."],
    });

    expect(grounding).toContain("agent memory");
    expect(grounding).toContain("The board asked for win-rate trend last quarter.");
    expect(grounding).toContain("company memory");
    expect(grounding).toContain("Pricing floor: Never discount below 20%.");
    expect(grounding).toContain("company knowledge shared with this agent");
    expect(grounding).toContain("multi-thread every deal above £50k");
  });

  test("a source left empty contributes nothing while the others still appear", () => {
    const grounding = buildSalesReportGroundingContext({
      agentMemories: [],
      companyMemories: [],
      knowledgeChunks: ["Territory notes: the North region renews in Q4."],
    });

    expect(grounding).not.toContain("agent memory");
    expect(grounding).not.toContain("company memory");
    expect(grounding).toContain("company knowledge shared with this agent");
  });

  test("grounding respects its context budgets", () => {
    const oversized = "x".repeat(REPORT_KNOWLEDGE_MAX_CHARS * 2);
    const grounding = buildSalesReportGroundingContext({
      agentMemories: ["y".repeat(REPORT_MEMORY_MAX_CHARS * 2)],
      companyMemories: [],
      knowledgeChunks: [oversized],
    });

    // Each block is capped by its own budget; the total stays bounded rather
    // than growing with the size of what was retrieved.
    expect(grounding.length).toBeLessThan(REPORT_KNOWLEDGE_MAX_CHARS + REPORT_MEMORY_MAX_CHARS + 500);
    expect(grounding).toContain("[TRUNCATED TO FIT CONTEXT BUDGET]");
  });
});

describe("goals in the grounding (personal-layer-and-goals-plan.md, part 1)", () => {
  test("stated aims lead the grounding under their own label", () => {
    const grounding = buildSalesReportGroundingContext({
      agentMemories: ["A memory."],
      companyMemories: [],
      knowledgeChunks: [],
      goalPages: [{ title: "Grow Comax revenue", content: "Lift Comax to £1m by year end." }],
    });

    expect(grounding).toContain("company goal");
    expect(grounding).toContain("Grow Comax revenue: Lift Comax to £1m by year end.");
    // Goals come first: the numbers are measured against the aims.
    expect(grounding.indexOf("company goal")).toBeLessThan(grounding.indexOf("agent memory"));
  });

  test("no goals means no goal block, and the field may be absent entirely", () => {
    expect(
      buildSalesReportGroundingContext({
        agentMemories: [],
        companyMemories: [],
        knowledgeChunks: [],
        goalPages: [],
      })
    ).toBe("");
  });
});
