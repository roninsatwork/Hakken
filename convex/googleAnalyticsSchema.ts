import { defineTable } from "convex/server";
import { v, type VString } from "convex/values";
import { CALENDAR_PERIODS, isCalendarPeriod, type CalendarPeriod } from "./utils/calendarPeriods";
import { appError } from "./utils/appError";
import { customRangeOf, type CustomPeriod } from "./utils/analyticsCustomPeriod";

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
  /**
   * Whether Google Analytics marks it as a key event. Absent on events read
   * before 2026-10-13, which were all key events; false for an event listed
   * because it reads as an enquiry (conversions-back-in-time-plan.md BT2).
   */
  keyEvent: v.optional(v.boolean()),
  /** A key event Google counts once a visit: Hakken counts the visits it happened in (BT1). */
  perVisit: v.optional(v.boolean()),
});

/**
 * How a website's conversions are counted (conversions-back-in-time-plan.md
 * BT1): Google's own count of each event, for every date kept, rather than its
 * key-event count, which begins only when an event is marked. A connection's
 * figures not yet collected this way are collected again, whole, on its next
 * run (BT4); one whose events were not yet listed this way has them read first.
 */
export const COUNTED_WITH = "EVENT_COUNT";

/**
 * How a connection's events are listed (`listedWith`): with the events that
 * read as enquiries beside the key events (BT2), and with the property's other
 * addresses read for conversions (conversion-addresses-plan.md). A connection
 * listed before has them read again on its next run, which then goes on.
 */
export const LISTED_WITH = "EVENT_COUNT_ADDRESSES";

/**
 * One of the property's other addresses, as last read
 * (conversion-addresses-plan.md, `utils/analyticsAddresses.ts`): what it is to
 * the website, whether visitors reached it from the website, the listed events
 * and sales that happened on it, and the admin's tick when it differs from
 * Hakken's choice.
 */
export const heldAddressValidator = v.object({
  host: v.string(),
  kind: v.union(v.literal("SAME_DOMAIN"), v.literal("OTHER_DOMAIN"), v.literal("COPY")),
  reached: v.boolean(),
  events: v.array(v.object({ eventName: v.string(), year: v.number(), month: v.number() })),
  counted: v.optional(v.boolean()),
});

/**
 * What a kept list is of (§4.2, GA20, GA23): the website's totals and its
 * channels with each source — the two small lists, kept by day and by device
 * for the charts — and its landing pages and all its pages, the two big ones,
 * kept only as ready-made periods for every device. `series` is the totals by
 * day over a long period (90 days, 12 months), asked of Google ready-made for
 * the charts the days kept do not reach. `event` is every event the website
 * recorded and `eventSeries` each of them a day, for Events and an event's
 * own screen (google-analytics-plan.md GA30, §18.6.5): every device.
 * `campaign` is the visits from tagged links by campaign and source, `adKeyword`
 * by the words a tagged link carries (`utm_term`), and `campaignSeries` each
 * campaign's visits a day, for Campaigns (GA28, §18.6.6): every device.
 * Visitors' lists — new or returning, browsers, operating systems, age,
 * gender and interests — and new and returning people a day (`visitorSeries`)
 * for Visitors (GA24, §18.6.6): every device. A shop's `product` list — each
 * product's looks, baskets, sales and revenue — and `productSeries`, the
 * products bought a day, for Products (GA34, §18.6.6): every device, only for
 * a website that is a shop. For Insights (insights-analyst-plan.md I35, §8):
 * `firstChannel`, each channel by the people it first brought, with what they
 * went on to convert — so an AI assistant that introduced a buyer who came
 * back by name gets the credit — and `landingChannel`, each landing page by
 * the channel of its visits, so a page's conversions from Google are known.
 */
/**
 * The shared lists (ga-stored-figures-plan.md SF13): each one plain fact
 * keyed first by a page — a landing page by source and new or returning, a
 * page by the page before (and, read the other way, by the page after), by
 * link clicked, by age and gender, by country, by weekday, by device, and a
 * landing page by the pages its visits saw — or by an event: the pages it
 * happened on and what it was about. Every page's and event's screen is
 * worked out from them. And the website's flow from its landing pages
 * (landing-pages-flow-plan.md LF5): its busiest routes, two steps on, and
 * each landing page's visits that went on and where most went.
 */
export const PAGE_FACT_LISTS = [
  "landingSource", "pageReferrer", "pageNext", "pageClicks", "pageWho", "landingWho", "pageCountry", "landingPagesSeen", "pageWeekday", "pageDevice",
  "eventPage", "eventDetail", "landingFlow", "landingOnward",
  // Each landing page by the visitors' browser, operating system and interests: Visitors' "where each kind of visitor
  // lands" (ga-conversions-visitors-plan.md CV7, CV8). Its new or returning, age and gender come from `landingSource`
  // and `landingWho`.
  "landingBrowser", "landingSystem", "landingInterest",
] as const;
export type PageFactList = (typeof PAGE_FACT_LISTS)[number];

export const ANALYTICS_LISTS = [
  // `series`: the website's 12 months a day, every device, for Insights (insights-analyst-plan.md): the charts read the
  // days, weeks and months kept (ga-stored-figures-plan.md SF12).
  "total", "channel", "landing", "page", "series", "event",
  // Each counted event by the day of the week and the hour it happened (conversions-and-agents-build-plan-2026-10-30.md,
  // phase 3, "When people convert"): a period list like `event`, the counted events only.
  "eventHour",
  "campaign", "adKeyword",
  "visitorType", "browser", "system", "age", "gender", "interest", "product",
  "firstChannel", "landingChannel",
  // AI assistants' landing pages (ga-channel-pages-plan.md CH13): each landing page by Google's channel and the AI source, AI sources only.
  "landingAssistant",
  // The landing pages by kind of page (conversion-charts-plan.md, 2026-10-29): a day list only (DAY_ONLY_LISTS), asked
  // as the landing pages and folded by the website's classification as they arrive; never a period's list.
  "landingKind",
  // The shared page lists (ga-stored-figures-plan.md SF13): each one fact keyed by page, sorted by it, a page's top 20.
  ...PAGE_FACT_LISTS,
] as const;
export type AnalyticsList = (typeof ANALYTICS_LISTS)[number];
export const analyticsListValidator = v.union(
  v.literal("total"),
  v.literal("channel"),
  v.literal("landing"),
  v.literal("page"),
  v.literal("series"),
  v.literal("event"),
  v.literal("eventHour"),
  v.literal("campaign"),
  v.literal("adKeyword"),
  v.literal("visitorType"),
  v.literal("browser"),
  v.literal("system"),
  v.literal("age"),
  v.literal("gender"),
  v.literal("interest"),
  v.literal("product"),
  v.literal("firstChannel"),
  v.literal("landingChannel"),
  v.literal("landingAssistant"),
  v.literal("landingKind"),
  v.literal("landingSource"),
  v.literal("pageReferrer"),
  v.literal("pageNext"),
  v.literal("pageClicks"),
  v.literal("pageWho"),
  v.literal("landingWho"),
  v.literal("pageCountry"),
  v.literal("landingPagesSeen"),
  v.literal("pageWeekday"),
  v.literal("pageDevice"),
  v.literal("eventPage"),
  v.literal("eventDetail"),
  v.literal("landingFlow"),
  v.literal("landingOnward"),
);

/**
 * The lists kept a day, then a week, then a month (ga-stored-figures-plan.md
 * SF2, SF12): what happens a day stored once, every date range added up
 * from it — the website's totals, its channels, each event, each campaign,
 * new and returning people, and a shop's products.
 */
/** Each page over time (ga-stored-figures-plan.md SF5): as a landing page and a page viewed, and as a landing page by channel. */
export const PAGE_SERIES_LISTS = ["landing", "page", "landingChannel", "landingAssistant"] as const;
export type PageSeriesList = (typeof PAGE_SERIES_LISTS)[number];
export const pageSeriesListValidator = v.union(v.literal("landing"), v.literal("page"), v.literal("landingChannel"), v.literal("landingAssistant"));

export const DAY_FACT_LISTS = ["total", "channel", "event", "campaign", "visitorType", "product", "landingKind"] as const;
export type DayFactList = (typeof DAY_FACT_LISTS)[number];
export const dayFactListValidator = v.union(
  v.literal("total"),
  v.literal("channel"),
  v.literal("event"),
  v.literal("campaign"),
  v.literal("visitorType"),
  v.literal("product"),
  v.literal("landingKind"),
);
/**
 * Kept as days only (conversion-charts-plan.md, 2026-10-29): the landing
 * pages by kind of page — each day's landing pages, asked as pages and added
 * up by the website's own classification as they arrive, a row a kind rather
 * than a row a page, so a big website's days stay small — for Conversions'
 * lines by page kind a day at a time. Never rolled into weeks or months, and
 * never filled back two years: a day past 90 goes.
 */
export const DAY_ONLY_LISTS: readonly DayFactList[] = ["landingKind"];
/** The day lists whose two years are filled and kept on as weeks and months. */
export const FILLED_DAY_LISTS: readonly DayFactList[] = DAY_FACT_LISTS.filter((list) => !DAY_ONLY_LISTS.includes(list));

/**
 * The ready-made periods (calendar-periods-plan.md, phase 6): the date menu's seven calendar periods, each Google's
 * own answer for its days in the property's time zone. The screens ask by these.
 */
export const ANALYTICS_PERIODS = CALENDAR_PERIODS;
/** The main home country's 12 months a day, and what needs a whole year (rule 10): a fixed last 12 months, never a menu choice. */
export const SERIES_PERIOD = "365" as const;
export { customPeriodKey, customRangeOf, type CustomPeriod } from "./utils/analyticsCustomPeriod";
/** A ready-made list's period, as its key names it. */
export type AnalyticsPeriod = CalendarPeriod | typeof SERIES_PERIOD | CustomPeriod;
export function isAnalyticsPeriod(value: string): value is AnalyticsPeriod {
  return isCalendarPeriod(value) || value === SERIES_PERIOD || customRangeOf(value) !== null;
}
/** The period a screen asked for: the menu's, or custom dates' key; anything else is refused. */
export function analyticsPeriodOf(value: string): AnalyticsPeriod {
  if (!isAnalyticsPeriod(value)) throw appError("INVALID_INPUT", "That is not a period the Dates menu offers.");
  return value;
}
/**
 * What a screen may ask by: a period the menu offers, or custom dates' key (`custom_from_to`). A key Convex cannot
 * spell as a validator, so the check is `v.string()` carrying the period type: a period nobody offers reads
 * nothing (`periodRange` gives it no days), never a crash, and a screen never sends one.
 */
export const analyticsPeriodValidator = v.string() as unknown as VString<AnalyticsPeriod>;

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
  /** People, new people and the seconds visits lasted (§18.6.2); missing on a part kept before the second round. */
  people: v.optional(v.string()),
  newPeople: v.optional(v.string()),
  length: v.optional(v.string()),
  /** An event's times (`eventCount`): only an event list's parts (§18.6.5). */
  times: v.optional(v.string()),
  /** A product's adds to the basket (`itemsAddedToCart`): only a product list's parts (§18.6.6). */
  basket: v.optional(v.string()),
  /**
   * The visits that made any listed event, each counted once however many it made: only landing pages by channel for
   * the dates now, for Conversions' "Left without converting" (ga-conversions-visitors-plan.md CV8).
   */
  converting: v.optional(v.string()),
  events: v.array(v.string()),
  /** One packed column per event in `events`. */
  counts: v.array(v.string()),
  /** The value Analytics gave each event, in hundredths, one packed column per event. */
  values: v.array(v.string()),
  /**
   * Each event's visits (`sessions` with the event, counted once a visit) and times (`eventCount`), one packed column
   * per event, beside `counts` (Google's own unit for the event, which every older screen reads): the Conversions
   * parts' Visits and Events counts (conversion-charts-plan.md). Missing on a part kept before 2026-10-29.
   */
  eventVisits: v.optional(v.array(v.string())),
  eventTimes: v.optional(v.array(v.string())),
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
  // A page Google counts again and again in one visit, its contents links taken as new views (analytics-page-screen-plan.md, phase 6).
  "COUNTED_AGAIN",
  // What each conversion really is (conversion-checks-plan.md): one matching an event that is never an enquiry, day for day;
  // an enquiry happening but not counted; a conversion that never happens.
  "SOMETHING_ELSE",
  "ENQUIRY_UNCOUNTED",
  "NEVER_HAPPENS",
  // Conversions on an address whose conversions don't count: a shop or booking page Hakken didn't pick (conversion-addresses-plan.md).
  "CONVERSIONS_ELSEWHERE",
] as const;
export type HealthCheck = (typeof HEALTH_CHECKS)[number];
export const healthCheckValidator = v.union(...HEALTH_CHECKS.map((check) => v.literal(check)));

/** One check's result, with what its words name: events, addresses or sources, a count, a share. */
export const healthResultValidator = v.object({
  check: healthCheckValidator,
  passing: v.boolean(),
  names: v.optional(v.array(v.string())),
  /** For each of `names`, the event it really is: "a conversion is really something else" alone. */
  others: v.optional(v.array(v.string())),
  count: v.optional(v.number()),
  share: v.optional(v.number()),
});

export const googleAnalyticsTables = {
  googleAnalyticsConnections: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    status: analyticsStatusValidator,
    /** Switched off on the website's Schedules page (docs/plans/active/website-schedules-plan.md, WS4): kept connected with everything held, and not collected until switched on again. */
    switchedOff: v.optional(v.boolean()),
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
    /**
     * The other addresses read with the events (conversion-addresses-plan.md): those whose conversions and sales count
     * (`conversionAddressesOf`) are read beside the website's own for them; visits and pages never are.
     */
    addressesRead: v.optional(v.array(heldAddressValidator)),
    /**
     * When the addresses whose conversions count last moved: a run that began before it collected some figures the
     * old way, so it never marks them counted (`countedWith`) — the next run collects them again, whole.
     */
    addressesMovedAt: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    currency: v.optional(v.string()),
    /** The property's key events and the events that read as enquiries, which count, and what each is worth. */
    events: v.optional(v.array(countedEventValidator)),
    /** When the key events were last read from Google: absent while they are read. */
    eventsReadAt: v.optional(v.number()),
    /** How the events were last listed (`LISTED_WITH`): with the events that read as enquiries, and the other addresses. */
    listedWith: v.optional(v.string()),
    /** How the figures held were counted (`COUNTED_WITH`); otherwise the next run collects them again, whole (BT4). */
    countedWith: v.optional(v.string()),
    /**
     * Listed events that count the same day for day (BT5): one is very likely a copy of the other, kept with each health
     * check. `of` an event never an enquiry (`NEVER_TICKED`, Ronins' link clicks) is a listed event that is really it.
     */
    copies: v.optional(v.array(v.object({ eventName: v.string(), of: v.string() }))),
    /** The property the figures held came from: choosing another clears them. */
    dataProperty: v.optional(v.string()),
    /**
     * The main home country the figures held are for, as Search Console names
     * it (`gbr`): when the website's main country changes they are cleared and
     * collected again (google-analytics-plan.md §18.6.1).
     */
    mainCountry: v.optional(v.string()),
    /**
     * A shop: a product looked at, added to a basket, checked out or bought in
     * the last 90 days, noted by the collector each time it reads the 90 days'
     * events; the Products page and its lists are only for a shop (§18.6.6).
     */
    shop: v.optional(v.boolean()),
    clearing: v.optional(v.boolean()),
    connectedBy: v.optional(v.id("users")),
    connectedAt: v.optional(v.number()),
    disconnectedAt: v.optional(v.number()),
    /** The newest and oldest days held, and when the first 90 days were all in. */
    newestDay: v.optional(v.string()),
    oldestDay: v.optional(v.string()),
    backfilledAt: v.optional(v.number()),
    /**
     * The first day the channels are held from, by week and month past the 90
     * days (ga-stored-figures-plan.md SF2, SF9): set once the two years are
     * filled from Google's history; until then only the 90 days are held.
     */
    historyFrom: v.optional(v.string()),
    /** The day lists whose two years are filled (SF12); a website filled before SF12 has the channels alone. */
    historyFilled: v.optional(v.array(dayFactListValidator)),
    /**
     * The ready-made list a run cut short by the night (`NIGHT_MS`) had not
     * asked yet, by its key (`jobKey`): the next night's run starts its lists
     * there, so the last lists are never the ones always left out.
     */
    listsFrom: v.optional(v.string()),
    /**
     * What Google last said is left of the website's allowances, and when
     * (ga-stored-figures-plan.md SF18; AGENTS.md, "Respect Google's quotas"):
     * a run's first ask of a step, a fill's and a run resumed after the hour
     * keep to it, rather than asking blind.
     */
    quotaSeen: v.optional(v.object({
      at: v.number(),
      tokensPerDay: v.union(v.number(), v.null()),
      tokensPerHour: v.union(v.number(), v.null()),
      tokensPerProjectPerHour: v.union(v.number(), v.null()),
      thresholdedPerHour: v.union(v.number(), v.null()),
    })),
    /**
     * The first day each page is held from, over time (ga-stored-figures-plan.md SF5): set once its two years are
     * filled from Google's history; until then a page's own chart is asked of Google.
     */
    pageHistoryFrom: v.optional(v.string()),
    /**
     * The first day each page is held from by channel, every device (page-conversion-explorer-plan.md): the first
     * night's collection that kept it, or the start of the two years once its fill has run.
     */
    pageChannelsFrom: v.optional(v.string()),
    /**
     * Each other home country's days, and its history and pages filled, as the
     * main country's fields above (ga-stored-figures-plan.md SF7): its records
     * are kept beside the main one's, their device `mobile|fra` (`dayDevice`).
     */
    countryHistory: v.optional(v.array(v.object({
      country: v.string(),
      newestDay: v.optional(v.string()),
      oldestDay: v.optional(v.string()),
      historyFrom: v.optional(v.string()),
      historyFilled: v.optional(v.array(dayFactListValidator)),
      pageHistoryFrom: v.optional(v.string()),
      pageChannelsFrom: v.optional(v.string()),
    }))),
    lastCollectedAt: v.optional(v.number()),
    /** When the periods still going were last asked of Google (daily), and the longer lists (weekly). */
    dailyPeriodsAt: v.optional(v.number()),
    weeklyPeriodsAt: v.optional(v.number()),
    /**
     * The finished periods fetched (calendar-periods-plan.md, phase 6), each home country's (`lastMonth|fra`, the main
     * one's bare): the first day of the one fetched, and whether it was asked again once Google's figures settled. A
     * finished period is asked once it ends, again two days later, then kept.
     */
    periodsFetched: v.optional(v.array(v.object({ key: v.string(), from: v.string(), settled: v.boolean() }))),
    /** When the website was last noted a shop: a run begun before it fetched the finished periods without products. */
    shopNotedAt: v.optional(v.number()),
    /** The run collecting it now, and the days it fetches, newest first from `top` back to `from`. */
    collecting: v.optional(v.object({ runId: v.id("agentRuns"), from: v.string(), top: v.string() })),
    /** Visits on each of the property's addresses over the last 30 days, asked weekly: the strangers check (§6, check 8). */
    hostVisits: v.optional(v.array(v.object({ host: v.string(), visits: v.number() }))),
    /** The listed events and sales on each of the property's addresses over the last 30 days, asked weekly with them (CONVERSIONS_ELSEWHERE). */
    hostConversions: v.optional(v.array(v.object({ host: v.string(), conversions: v.number() }))),
    /** The tracking health checks' last results (§6): when a check starts failing, the company's admins are told once. */
    health: v.optional(v.object({ checkedAt: v.number(), checks: v.array(healthResultValidator) })),
    /** What stopped the connection or its last collection; cleared when a collection goes right. */
    problem: v.optional(analyticsProblemValidator),
    problemAt: v.optional(v.number()),
    /** Google's own words for the problem, when it gave any (ga-big-site-reliability-plan.md BR1). */
    problemDetail: v.optional(v.string()),
    /** Reading the property's events failed: when Hakken asks again by itself (BR1). Cleared once they are read. */
    readAgainAt: v.optional(v.number()),
    /**
     * How far each two-year fill has got (ga-big-site-reliability-plan.md BR6): for the main home country (`""`) or
     * another, a day list's or the pages' (`pages`) last day filled, oldest first; the next fill starts after it.
     */
    fillsReached: v.optional(v.array(v.object({ country: v.string(), fill: v.string(), to: v.string() }))),
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
   * 2,000 rows. Kept 90 days (ga-stored-figures-plan.md SF2), for the charts
   * and the days' own figures; then a channel day goes into its week
   * (`googleAnalyticsHistory`) and a total day goes.
   */
  googleAnalyticsDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    list: dayFactListValidator,
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
   * The channels past the 90 days kept as days (ga-stored-figures-plan.md
   * SF2): a week to 12 months, a month to two years, each the sum of its days,
   * every device and each device — packed and split as the days are. A day
   * past 90 goes into its week, a week past a year into the month it starts
   * in, a month past two years goes (`googleAnalyticsHistory.rollHistory`).
   */
  googleAnalyticsHistory: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    list: dayFactListValidator,
    device: v.string(),
    grain: v.union(v.literal("week"), v.literal("month")),
    /** The week's Monday or the month's first day. */
    start: v.string(),
    part: v.number(),
    ...analyticsPackedRows,
    ...leftOut,
    fetchedAt: v.number(),
  })
    // A device's weeks or months, for its chart.
    .index("by_hold_device_grain_start", ["companyWebsiteId", "list", "device", "grain", "start", "part"])
    // The oldest weeks or months, as they roll on and go.
    .index("by_hold_grain_start", ["companyWebsiteId", "grain", "start", "device", "part"]),

  /**
   * One page over time (ga-stored-figures-plan.md SF5): as a landing page
   * (`landing`: its visits, engaged visits and key events) or as a page viewed
   * (`page`: its views too), every device and each — a day for 90 days, a week
   * to 12 months, a month to two years. Its points are a packed list keyed by
   * when: `2026-10-12` a day, `w:2026-07-13` a week, `m:2025-10-01` a month.
   * Reshaped as each new day is written; a page with nothing in two years goes
   * (`googleAnalyticsPageSeries.dropOldPageSeries`).
   */
  googleAnalyticsPageSeries: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    /**
     * `landing` and `page` by point and device; `landingChannel` and `landingAssistant` by point and channel — the
     * assistants' by Google's channel and their source — every device only (page-conversion-explorer-plan.md).
     */
    list: pageSeriesListValidator,
    /** The page's number on the website (`holdPageRefs`). */
    page: v.string(),
    device: v.string(),
    ...analyticsPackedRows,
    /** Its newest point's day: a page quiet for two years is cleared by it. */
    lastDay: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_hold_list_page_device", ["companyWebsiteId", "list", "page", "device"])
    .index("by_hold_last", ["companyWebsiteId", "lastDay"]),

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
    /** A list sorted by page (SF13): the part's first row's key, so a page's screen reads only the parts its rows are in. */
    firstKey: v.optional(v.string()),
  })
    .index("by_hold_key_slot_part", ["companyWebsiteId", "key", "slot", "part"])
    .index("by_hold_key_slot_first", ["companyWebsiteId", "key", "slot", "firstKey"]),

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
  /**
   * Each page's title, as Google Analytics saw it most over the last 90 days
   * (GA27, §18.6.3), by the hold's page number: asked weekly, and copied onto
   * the website's one page list (`holdPages.title`) by its rebuild, which
   * every screen reads. `askedAt` names the week's ask; older ones go.
   */
  googleAnalyticsTitles: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    page: v.string(),
    title: v.string(),
    views: v.number(),
    askedAt: v.number(),
  }).index("by_hold_page", ["companyWebsiteId", "page"]),
};
