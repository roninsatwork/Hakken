import { defineTable } from "convex/server";
import { v } from "convex/values";
import { clarityRowValidator } from "./utils/clarityRows";

/**
 * Microsoft Clarity (docs/plans/active/insights-analyst-plan.md I24, I27,
 * §7b, phase 15): each own website's Clarity project, connected by a pasted
 * Data Export token kept as ciphertext only, and its figures a day — Clarity
 * keeps three days, so Hakken asks each morning and keeps the history.
 */

export const clarityStatusValidator = v.union(v.literal("CONNECTED"), v.literal("NEEDS_RECONNECT"), v.literal("DISCONNECTED"));

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

  /** One website's figures for one day, by page or by device: kept 13 months. */
  clarityDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    day: v.string(),
    /** By page, by device, or by page and device together ("/path|Mobile"). */
    by: v.union(v.literal("PAGE"), v.literal("DEVICE"), v.literal("PAGE_DEVICE")),
    rows: v.array(clarityRowValidator),
    createdAt: v.number(),
  })
    .index("by_hold_by_day", ["companyWebsiteId", "by", "day"]),
};
