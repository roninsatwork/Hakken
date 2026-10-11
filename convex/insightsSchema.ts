import { defineTable } from "convex/server";
import { v } from "convex/values";
import { factValidator } from "./utils/insightFacts";
import { INSIGHT_SPECIALISTS } from "./utils/insightTeam";

/**
 * What the Insights team keeps (docs/plans/active/insights-analyst-plan.md
 * §8): its conclusions only, all small. The sources stay where their
 * collectors keep them; a finding holds the few facts it used, as read, so
 * it can be shown and checked later without reading the sources again.
 * Words are written once, in English (the Translator writes the rest, I17).
 */

export const insightSpecialistValidator = v.union(...INSIGHT_SPECIALISTS.map((specialist) => v.literal(specialist)));

export const insightSureValidator = v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"));

/** Published once the Editor passed it; sent back with the reason when it did not (I21, I29). */
export const insightFindingStatusValidator = v.union(v.literal("PUBLISHED"), v.literal("SENT_BACK"));

/** How a finding turned out on the day it named (keeping score, §2.7): right, wrong, or too early to say. */
export const insightOutcomeValidator = v.union(v.literal("RIGHT"), v.literal("WRONG"), v.literal("TOO_EARLY"));

export const insightsTables = {
  /**
   * One finding: a story the team found in a website's sources, what it is
   * worth, what to do, and how we'll know — its words with the figures filled
   * in, the facts they came from, and the Editor's verdict.
   */
  insightFindings: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    /** The week's Monday it was found in (UTC), "2026-10-12". */
    week: v.string(),
    runId: v.optional(v.id("agentRuns")),
    /** Who found it; "strategy" when the Head of Strategy joined two specialists' findings into one story. */
    specialist: insightSpecialistValidator,
    /** The pattern it is (§3), a short code: "sameVisitorsFewerResults". */
    pattern: v.string(),
    status: insightFindingStatusValidator,
    /** Its place in the week, 1 the most at stake. */
    rank: v.number(),
    headline: v.string(),
    story: v.string(),
    /** What the specialists checked and ruled out. */
    ruledOut: v.array(v.string()),
    action: v.string(),
    /** How we'll know it worked: the figure to watch and by when. */
    howWeKnow: v.string(),
    sure: insightSureValidator,
    /** The sources it joins, as fact sources: "analytics", "searchConsole", "market"… */
    sources: v.array(v.string()),
    /** The facts its words name, as read when it was written. */
    facts: v.array(factValidator),
    /** Each comparison it makes, two facts' keys: what the Editor checked as like with like. */
    comparisons: v.array(v.array(v.string())),
    /** The figure to read again on `checkOn`, and which way it should move. */
    watch: v.optional(v.object({ key: v.string(), direction: v.union(v.literal("UP"), v.literal("DOWN")) })),
    checkOn: v.optional(v.string()),
    outcome: v.optional(insightOutcomeValidator),
    outcomeNote: v.optional(v.string()),
    /** Why the Editor sent it back, or what it changed. */
    editorNote: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_company_week", ["companyId", "week"])
    .index("by_hold_week", ["companyWebsiteId", "week"])
    .index("by_check", ["status", "checkOn"]),

  /**
   * A website's week: the run's verdict in one sentence, what was read and
   * what could not be, and what it cost — Admin → Insights → Weekly runs, and
   * the executive summary's verdict.
   */
  insightWeeks: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    week: v.string(),
    runId: v.optional(v.id("agentRuns")),
    verdict: v.string(),
    /** Each source and whether it could be read. */
    sources: v.array(v.object({ source: v.string(), facts: v.number() })),
    problems: v.array(v.string()),
    published: v.number(),
    sentBack: v.number(),
    costUsd: v.number(),
    createdAt: v.number(),
  })
    .index("by_hold_week", ["companyWebsiteId", "week"])
    .index("by_company_week", ["companyId", "week"]),
};
