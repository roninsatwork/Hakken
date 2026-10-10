import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The tables behind Google Analytics for a company's own websites
 * (docs/plans/active/google-analytics-plan.md). Every row is one company's
 * alone, filed against its owned website (the hold) and read only through it,
 * as Search Console's are (§4.6). The Google sign-in itself is shared with
 * Search Console (`googleSchema.ts`); what is here is Analytics' own choice —
 * the property, the address read, what counts — and its own figures.
 */

export const analyticsStatusValidator = v.union(
  /** Signing in at Google, never connected before. */
  v.literal("CONNECTING"),
  /** Signed in; the property is still to be chosen (§3, step 3). */
  v.literal("CHOOSING"),
  /** The property chosen; what counts as a conversion still to be saved (§3, step 5). */
  v.literal("COUNTING"),
  v.literal("CONNECTED"),
  /** Google stopped letting the account read the property: connect again. */
  v.literal("NEEDS_RECONNECT"),
  /** Disconnected by an admin; what was collected stays. */
  v.literal("DISCONNECTED"),
);
export type AnalyticsStatus = "CONNECTING" | "CHOOSING" | "COUNTING" | "CONNECTED" | "NEEDS_RECONNECT" | "DISCONNECTED";

/** Why the connection stopped: Search Console's own codes (`searchConsoleSchema.ts`), worded alike on screen. */
export const analyticsProblemValidator = v.union(
  v.literal("REVOKED"),
  v.literal("NO_ACCESS"),
  v.literal("UNREADABLE"),
  v.literal("NOT_CONFIGURED"),
  v.literal("GOOGLE_BUSY"),
  v.literal("NOT_OWNED"),
);

/** How the last sign-in ended when it did not connect, as Search Console's. */
export const analyticsAttemptValidator = v.union(
  v.literal("DECLINED"),
  v.literal("MISSING_SCOPE"),
  v.literal("NO_PROPERTY"),
  v.literal("FAILED"),
);

export const propertyChoiceValidator = v.object({
  property: v.string(),
  displayName: v.string(),
  accountName: v.string(),
  /** Its web stream's address for this website, when it has one. */
  stream: v.union(v.string(), v.null()),
  checked: v.boolean(),
});

/**
 * A key event of the property, and whether it counts as a conversion here
 * (GA5). Its value comes from Analytics when Analytics has one, and Hakken's
 * fills only the events Analytics has none for (GA3, GA6; §10, Q1).
 */
export const countedEventValidator = v.object({
  eventName: v.string(),
  counted: v.boolean(),
  /** Each one's value in Analytics, in the property's currency; null when it has none. */
  analyticsValue: v.union(v.number(), v.null()),
  /** Each one's value set in Hakken, applied when read (§4.3), so changing it re-prices the past. */
  hakkenValue: v.union(v.number(), v.null()),
  /** How many in the last 30 days, when the events were read: shown beside each. */
  lastThirtyDays: v.number(),
});

export const googleAnalyticsTables = {
  googleAnalyticsConnections: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    status: analyticsStatusValidator,
    /** The shared Google sign-in this connection reads with (`googleSchema.ts`). */
    googleConnectionId: v.optional(v.id("googleConnections")),
    /** A sign-in under way: its single-use state, when it began and who began it. */
    pendingState: v.optional(v.string()),
    pendingAt: v.optional(v.number()),
    pendingBy: v.optional(v.id("users")),
    /** The account's properties, the website's first, while one is chosen. */
    choices: v.optional(v.array(propertyChoiceValidator)),
    /** The addresses of the properties that record the website, read on the way back from Google, for the choice's line. */
    addressesFound: v.optional(v.array(v.object({ property: v.string(), addresses: v.array(v.string()), others: v.array(v.string()) }))),
    property: v.optional(v.string()),
    propertyName: v.optional(v.string()),
    /** The property's web stream for the website. */
    stream: v.optional(v.string()),
    /** The addresses read (`hostName`), and the property's others, left out of every figure (§3, step 4). */
    addresses: v.optional(v.array(v.string())),
    otherAddresses: v.optional(v.array(v.string())),
    timeZone: v.optional(v.string()),
    currency: v.optional(v.string()),
    /** The property's key events, which count, and what each is worth. */
    events: v.optional(v.array(countedEventValidator)),
    /** When the key events were last read from Google: absent while they are read. */
    eventsReadAt: v.optional(v.number()),
    /** The property the figures held came from: choosing another clears them. */
    dataProperty: v.optional(v.string()),
    clearing: v.optional(v.boolean()),
    connectedBy: v.optional(v.id("users")),
    connectedAt: v.optional(v.number()),
    disconnectedAt: v.optional(v.number()),
    /** The newest and oldest days held, and when the first 90 days were all in. */
    newestDay: v.optional(v.string()),
    oldestDay: v.optional(v.string()),
    backfilledAt: v.optional(v.number()),
    lastCollectedAt: v.optional(v.number()),
    /** The run collecting it now, and the days it fetches, newest first from `top` back to `from`. */
    collecting: v.optional(v.object({ runId: v.id("agentRuns"), from: v.string(), top: v.string() })),
    /** What stopped the connection or its last collection; cleared when a collection goes right. */
    problem: v.optional(analyticsProblemValidator),
    problemAt: v.optional(v.number()),
    /** The last sign-in that did not connect, and the account it was tried with. */
    attempt: v.optional(v.object({ outcome: analyticsAttemptValidator, account: v.optional(v.string()), at: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_pending_state", ["pendingState"])
    .index("by_status", ["status"]),
};
