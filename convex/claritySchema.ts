import { defineTable } from "convex/server";
import { v } from "convex/values";
import { clarityRowValidator } from "./utils/clarityRows";
import { clarityDailyValidator, clarityPackValidator } from "./utils/clarityPacks";

/**
 * Microsoft Clarity (docs/plans/active/insights-analyst-plan.md I24, I27,
 * §7b, phase 15): each own website's Clarity project, connected by a pasted
 * Data Export token kept as ciphertext only, and its figures — Clarity keeps
 * three days, so Hakken asks each morning and keeps the history.
 */

export const clarityStatusValidator = v.union(v.literal("CONNECTED"), v.literal("NEEDS_RECONNECT"), v.literal("DISCONNECTED"));

/**
 * What a kept record of figures covers (docs/plans/active/agents-and-clarity-plan.md,
 * Part 0): a day, kept 90 days — the longest any screen shows; a month, kept
 * 13 months, so a month can be set against the same month a year before; and
 * the three ready-made periods the screens read, worked out each morning.
 */
export const claritySpanValidator = v.union(v.literal("DAY"), v.literal("MONTH"), v.literal("LAST_7"), v.literal("LAST_30"), v.literal("LAST_90"));

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
    /** Why the last ask failed, in Clarity's words, when it did. */
    problem: v.optional(v.string()),
    newestDay: v.optional(v.string()),
    oldestDay: v.optional(v.string()),
    lastCollectedAt: v.optional(v.number()),
    connectedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_status", ["status"]),

  /**
   * One website's figures for a day, a month or a ready-made period: each page
   * on each device, and each device across the website, as whole-number totals
   * packed with their own books (`utils/clarityPacks.ts`). One record a span,
   * where three a day were kept before; `key` is the day, the month, or the
   * newest day a period ends on.
   */
  clarityFigures: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    span: claritySpanValidator,
    key: v.string(),
    /** A period's parts in order: the first carries the website's figures and its days, the rest only pages. A day's or a month's is 0. */
    part: v.number(),
    from: v.string(),
    to: v.string(),
    /** Days in it that Clarity recorded anything: "4 days so far", not "the last 30". */
    days: v.number(),
    pages: clarityPackValidator,
    site: clarityPackValidator,
    /** A period's or a month's website totals a day, for its charts. */
    daily: v.optional(clarityDailyValidator),
    builtAt: v.number(),
  })
    .index("by_hold_span_key", ["companyWebsiteId", "span", "key"])
    .index("by_hold_span_part", ["companyWebsiteId", "span", "part", "key"]),

  /**
   * Being replaced by `clarityFigures` (agents-and-clarity-plan.md, Part 0):
   * a day's figures by page, device or both, three records a day, each row an
   * object with its address. `clarity:convertOldDays` turns what is held into
   * days of the new kind and deletes these; the table goes once that has run.
   */
  clarityDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    day: v.string(),
    /** By page, by device, or by page and device together ("/path|Mobile"). */
    by: v.union(v.literal("PAGE"), v.literal("DEVICE"), v.literal("PAGE_DEVICE")),
    rows: v.array(clarityRowValidator),
    createdAt: v.number(),
  }),
};
