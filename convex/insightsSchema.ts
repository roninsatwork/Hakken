import { defineTable } from "convex/server";
import { v } from "convex/values";
import { factValidator } from "./utils/insightFacts";
import { INSIGHT_SPECIALISTS } from "./utils/insightTeam";
import { REPORT_KINDS, reportBodyValidator, weekSummaryValidator } from "./utils/insightSummary";
import { measurementValidator } from "./utils/insightMeasurement";

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
    /** Enquiries a year at stake, where the pattern counts them (a page that lost its enquiries). */
    atStake: v.optional(v.number()),
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
    /** When someone at the company took its steps on (Add the steps to Hakken tasks): the Track record's "acted on". */
    actedAt: v.optional(v.number()),
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
    /** The executive summary's scorecard and charts, worked out in the run and kept with the week (§8). */
    summary: v.optional(weekSummaryValidator),
    createdAt: v.number(),
  })
    .index("by_hold_week", ["companyWebsiteId", "week"])
    .index("by_company_week", ["companyId", "week"])
    .index("by_created", ["createdAt"]),

  /**
   * The change log (I25): each change Hakken sees on a website — a page
   * replaced or removed, read from its own Analytics — with what followed,
   * once a change, kept with its findings' two years.
   */
  insightChanges: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    /** The week it was first seen in. */
    week: v.string(),
    kind: v.union(v.literal("REPLACED"), v.literal("MERGED"), v.literal("REMOVED"), v.literal("ADDED")),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    seenIn: v.string(),
    before: v.number(),
    after: v.number(),
    result: v.union(v.literal("LOST"), v.literal("HELD"), v.literal("GREW")),
    createdAt: v.number(),
  })
    .index("by_hold_kind_from", ["companyWebsiteId", "kind", "from"])
    .index("by_company_created", ["companyId", "createdAt"]),

  /**
   * How findings turned out, counted (§2.7, I7): kept after the findings
   * themselves go, so the Track record's tally outlives its two years.
   * One row a company and specialist.
   */
  insightTally: defineTable({
    companyId: v.id("companies"),
    specialist: v.string(),
    right: v.number(),
    wrong: v.number(),
    unclear: v.number(),
    updatedAt: v.number(),
  }).index("by_company_specialist", ["companyId", "specialist"]),

  /**
   * Learnings across every company (I30), from totals only: each kind of
   * change and how often it held, so a specialist can say "this fix worked
   * on 7 of 10 websites like yours". No company's figures are kept here.
   */
  /**
   * The Measurement check (§4.1, phase 13): whether a website's figures can be
   * trusted, as the newest run found — one row a website, replaced each run,
   * kept apart from the week so the screens that read every week stay light.
   */
  insightMeasurements: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    week: v.string(),
    ...measurementValidator.fields,
    createdAt: v.number(),
  }).index("by_hold", ["companyWebsiteId"]),

  insightLearnings: defineTable({
    kind: v.string(),
    companies: v.array(v.id("companies")),
    lost: v.number(),
    held: v.number(),
    grew: v.number(),
    updatedAt: v.number(),
  }).index("by_kind", ["kind"]),

  /**
   * The reports Hakken writes, frozen as written (§4.1, §4.2, I6): the weekly
   * brief each run, the monthly report from the 4th, and the board report
   * once a quarter. Kept two years (I7); a PDF is made when one is
   * downloaded, never stored. No email in alpha (I17).
   */
  insightReports: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    kind: v.union(...REPORT_KINDS.map((kind) => v.literal(kind))),
    /** The days it covers, and the week, month or quarter it is of. */
    from: v.string(),
    to: v.string(),
    period: v.string(),
    title: v.string(),
    status: v.union(v.literal("WRITTEN"), v.literal("READ")),
    readAt: v.optional(v.number()),
    body: reportBodyValidator,
    runId: v.optional(v.id("agentRuns")),
    createdAt: v.number(),
  })
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_hold_kind_period", ["companyWebsiteId", "kind", "period"]),
};
