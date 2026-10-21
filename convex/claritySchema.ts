import { defineTable } from "convex/server";
import { v } from "convex/values";
import { clarityDailyValidator, clarityPackValidator } from "./utils/clarityPacks";
import { clarityRecordingValidator } from "./utils/clarityRecordings";

/**
 * Microsoft Clarity (docs/plans/active/insights-analyst-plan.md I24, I27,
 * §7b, phase 15): each own website's Clarity project, connected by a pasted
 * Data Export token kept as ciphertext only, and its figures — Clarity keeps
 * three days, so Hakken asks each morning and keeps the history.
 */

export const clarityStatusValidator = v.union(v.literal("CONNECTED"), v.literal("NEEDS_RECONNECT"), v.literal("DISCONNECTED"));

/**
 * What a kept record of figures covers (docs/plans/active/agents-and-clarity-plan.md,
 * Part 0, and "Finishing Parts 3 and 4"): a day, kept 180 days; a month, kept
 * 13 months, so a month can be set against the same month a year before and a
 * year read once its days are past keeping; the seven calendar periods the
 * screens read (`PERIOD`, keyed by the period) and what each is set against
 * (`PERIOD_BEFORE`), worked out each morning (calendar-periods-plan.md, phase
 * 3). The 7, 30 and 90 days they replaced were cleared on Anthony's word (2026-10-21).
 */
export const claritySpanValidator = v.union(
  v.literal("DAY"),
  v.literal("MONTH"),
  v.literal("PERIOD"),
  v.literal("PERIOD_BEFORE"),
);

/**
 * What else a record holds, beside a day's or a period's own figures (none):
 * the visits split by source, or by browser — each by device across the
 * website (`site`) and by page and device (`pages`), so a day's record never
 * nears Convex's limits however many pages, sources and browsers there are,
 * and a screen reads only what it shows.
 */
export const clarityKindValidator = v.union(v.literal("SOURCES"), v.literal("BROWSERS"));

export const clarityTables = {
  clarityConnections: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    status: clarityStatusValidator,
    /** Switched off on the website's Schedules page (docs/plans/active/website-schedules-plan.md, WS4): kept connected with everything held, and not collected until switched on again. */
    switchedOff: v.optional(v.boolean()),
    /** The Data Export token, as ciphertext only (`connectorTokenCrypto`); never sent to a screen. */
    tokenCiphertext: v.string(),
    /** Clarity's project, when its answers name it. */
    projectName: v.optional(v.string()),
    /** Clarity's own id for the project, read from a recording's link: what a link to a page's heatmap needs. */
    projectId: v.optional(v.string()),
    /** The website's address as Clarity records its pages ("https://www.example.com"), for those links. */
    origin: v.optional(v.string()),
    /** Why the last ask failed, in Clarity's words, when it did. */
    problem: v.optional(v.string()),
    newestDay: v.optional(v.string()),
    oldestDay: v.optional(v.string()),
    lastCollectedAt: v.optional(v.number()),
    /** Clarity's asks counted for the UTC day (agents-and-clarity-plan.md, CC3): ten a day, two kept in hand. */
    asks: v.optional(v.object({ day: v.string(), used: v.number() })),
    /** The Collector's run collecting this website now, so two never collect it at once. */
    collecting: v.optional(v.object({ runId: v.id("agentRuns"), at: v.number() })),
    connectedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_status", ["status"]),

  /**
   * One website's figures for a day, a month or a ready-made period: each page
   * on each device, and each device across the website, as whole-number totals
   * packed with their own books (`utils/clarityPacks.ts`). One record a span
   * and kind — its own figures, its sources, its browsers — where three a day
   * were kept before; `key` is the day, the month, or the newest day a period
   * ends on.
   */
  clarityFigures: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    span: claritySpanValidator,
    /** Absent for the day's or the period's own figures; the sources or browsers otherwise. */
    kind: v.optional(clarityKindValidator),
    key: v.string(),
    /**
     * A record's parts in order: the first carries the website's figures (and
     * a period's days), the rest its pages in the pages' order, never one
     * page's rows across two parts. A month's is 0 alone, as was every day's
     * kept before 2026-10-16.
     */
    part: v.number(),
    /** A pages part's first page, so one page's rows are read from the one part that holds them. */
    firstPage: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    /** Days in it that Clarity recorded anything: "4 days so far", not "the last 30". */
    days: v.number(),
    /**
     * A period's or month's days that hold page rows, and the first of them,
     * where fewer than `days`: a day kept before 2026-10-16 holds the
     * website's figures only (its pages were filed wrongly, and dropped).
     */
    pageDays: v.optional(v.number()),
    pagesFrom: v.optional(v.string()),
    /**
     * A day's page rows were cut at Clarity's 1,000 rows an answer (`cut`, on
     * its first part), and a period's or month's days that were (`cutDays`):
     * quieter pages may be missing from them (agents-and-clarity-plan.md,
     * "Large websites").
     */
    cut: v.optional(v.boolean()),
    cutDays: v.optional(v.number()),
    pages: clarityPackValidator,
    site: clarityPackValidator,
    /** A period's or a month's website totals a day, for its charts. */
    daily: v.optional(clarityDailyValidator),
    builtAt: v.number(),
  })
    .index("by_hold_span_part", ["companyWebsiteId", "span", "part", "key"])
    .index("by_hold_span_kind_key", ["companyWebsiteId", "span", "kind", "key"])
    .index("by_hold_span_kind_key_page", ["companyWebsiteId", "span", "kind", "key", "firstPage"]),

  /**
   * The recordings Hakken picks each morning from Clarity's own (agents-and-clarity-plan.md,
   * CM2): the visits that show where people give up — an error, a failed or an
   * angry click, a quick return — and the longest reads, each with its link to
   * watch it in Clarity. Kept 30 days, as Clarity keeps its recordings.
   */
  clarityRecordings: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    /** The day it was picked for: the day before the morning that picked it. */
    day: v.string(),
    ...clarityRecordingValidator.fields,
    createdAt: v.number(),
  })
    .index("by_hold_day", ["companyWebsiteId", "day"]),
};
