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

/**
 * What a kept list is of (§4.2, GA20, GA23): the website's totals and its
 * channels with each source — the two small lists, kept by day and by device
 * for the charts — and its landing pages and all its pages, the two big ones,
 * kept only as ready-made periods for every device. `series` is the totals by
 * day over a long period (90 days, 12 months), asked of Google ready-made for
 * the charts the days kept do not reach.
 */
export const ANALYTICS_LISTS = ["total", "channel", "landing", "page", "series"] as const;
export type AnalyticsList = (typeof ANALYTICS_LISTS)[number];
export const analyticsListValidator = v.union(
  v.literal("total"),
  v.literal("channel"),
  v.literal("landing"),
  v.literal("page"),
  v.literal("series"),
);

/** The ready-made periods (§4.3): days, ending on the newest day held. */
export const ANALYTICS_PERIODS = ["7", "30", "90", "365"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export const analyticsPeriodValidator = v.union(v.literal("7"), v.literal("30"), v.literal("90"), v.literal("365"));

/** The period itself, the span before it, and the same span a year before (§10, Q2). */
export const analyticsWhichValidator = v.union(v.literal("NOW"), v.literal("BEFORE"), v.literal("YEAR"));
export type AnalyticsWhich = "NOW" | "BEFORE" | "YEAR";

/**
 * One list's rows, packed as Search Console's are (`utils/searchConsolePacks.ts`):
 * parallel columns, row `i` across them all, each column of numbers as text a
 * few characters a number. Money is kept in hundredths (pence), every other
 * figure whole. Every key event of the property has a count and a value
 * column, named in `events` — whether it counts as a conversion, and what a
 * Hakken value makes it worth, is applied when read (§4.3), so changing either
 * re-prices all history without rewriting it.
 */
export const analyticsPackedRows = {
  keys: v.array(v.string()),
  visits: v.string(),
  engaged: v.string(),
  /** Seconds engaged. */
  seconds: v.string(),
  views: v.string(),
  purchases: v.string(),
  /** Purchase revenue, in hundredths of the property's currency. */
  revenue: v.string(),
  events: v.array(v.string()),
  /** One packed column per event in `events`. */
  counts: v.array(v.string()),
  /** The value Analytics gave each event, in hundredths, one packed column per event. */
  values: v.array(v.string()),
};

/** What Google said it left out of a list (§2.5): the screens say so. */
const leftOut = {
  /** Google folded its rarest rows into "(other)". */
  folded: v.optional(v.boolean()),
  /** Google held back rows with few visitors. */
  thresholded: v.optional(v.boolean()),
  /** Longer than Hakken reads: the rest left out. */
  cut: v.optional(v.boolean()),
};

/** The tracking health checks (§6), in the order the plan lists them. */
export const HEALTH_CHECKS = [
  "NOTHING_COUNTED",
  "NO_VALUE",
  "TRACKING_STOPPED",
  "SUDDEN_FALL",
  "SELF_REFERRAL",
  "PAYMENT_REFERRALS",
  "TOO_MUCH_UNKNOWN",
  "STRANGERS",
] as const;
export type HealthCheck = (typeof HEALTH_CHECKS)[number];
export const healthCheckValidator = v.union(...HEALTH_CHECKS.map((check) => v.literal(check)));

/** One check's result, with what its words name: events, addresses or sources, a count, a share. */
export const healthResultValidator = v.object({
  check: healthCheckValidator,
  passing: v.boolean(),
  names: v.optional(v.array(v.string())),
  count: v.optional(v.number()),
  share: v.optional(v.number()),
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
    /** When the 7 and 30 days were last asked of Google (daily), and the 90 days and 12 months (weekly). */
    dailyPeriodsAt: v.optional(v.number()),
    weeklyPeriodsAt: v.optional(v.number()),
    /** The run collecting it now, and the days it fetches, newest first from `top` back to `from`. */
    collecting: v.optional(v.object({ runId: v.id("agentRuns"), from: v.string(), top: v.string() })),
    /** Visits on each of the property's addresses over the last 30 days, asked weekly: the strangers check (§6, check 8). */
    hostVisits: v.optional(v.array(v.object({ host: v.string(), visits: v.number() }))),
    /** The tracking health checks' last results (§6): when a check starts failing, the company's admins are told once. */
    health: v.optional(v.object({ checkedAt: v.number(), checks: v.array(healthResultValidator) })),
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

  /**
   * A day of one of the two small lists (§4.2): one record per website, list,
   * device and day — `device` empty for every device — split into parts of
   * 2,000 rows. Kept 60 days (§4.3), for the charts and the days' own figures.
   */
  googleAnalyticsDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    list: v.union(v.literal("total"), v.literal("channel")),
    /** Google's `deviceCategory` (`mobile`), or empty for every device. */
    device: v.string(),
    day: v.string(),
    part: v.number(),
    ...analyticsPackedRows,
    ...leftOut,
    fetchedAt: v.number(),
  })
    // A device's days, for its chart.
    .index("by_hold_list_device_day", ["companyWebsiteId", "list", "device", "day", "part"])
    // A day's records, as it is written again and as old days go.
    .index("by_hold_list_day_device", ["companyWebsiteId", "list", "day", "device", "part"]),

  /**
   * Which build of each ready-made list the screens read (§4.3): a list is
   * written whole into the slot not being read, then this flips, so a screen
   * never reads half of one build and half of another. `key` is the list, the
   * period, which span and the device.
   */
  googleAnalyticsPeriodSlots: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    key: v.string(),
    slot: v.number(),
    parts: v.number(),
    from: v.string(),
    to: v.string(),
    ...leftOut,
    /** A fingerprint of the parts: a build whose figures did not move is not written again (GA23). */
    hash: v.string(),
    builtAt: v.number(),
  }).index("by_hold_key", ["companyWebsiteId", "key"]),

  /**
   * A ready-made period's list, asked of Google ready-made (GA23): never
   * added up from days, so neither a screen nor a collection adds up a page
   * list. Read through its slot (`googleAnalyticsPeriodSlots`).
   */
  googleAnalyticsPeriods: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    key: v.string(),
    slot: v.number(),
    part: v.number(),
    ...analyticsPackedRows,
  }).index("by_hold_key_slot_part", ["companyWebsiteId", "key", "slot", "part"]),

  /**
   * A list asked of Google when a screen needed it (GA20, GA22): a device on
   * a page list, a landing page's own screen, dates not kept ready. Held
   * until the next collection, so paging, sorting and searching never ask
   * again (GA23). `ask` names what was asked.
   */
  googleAnalyticsLive: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    ask: v.string(),
    part: v.number(),
    parts: v.number(),
    ...analyticsPackedRows,
    ...leftOut,
    askedAt: v.number(),
  }).index("by_hold_ask_part", ["companyWebsiteId", "ask", "part"]),
};
