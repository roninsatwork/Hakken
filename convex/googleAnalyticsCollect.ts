import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isTrackedHold } from "./utils/websitePairing";
import { ALPHA3_TO_ALPHA2 } from "./utils/countryCodes";
import { countriesKeptReady, mainConsoleCountry, stillKeptReady } from "./searchConsoleCountries";
import { countryOfDayDevice, dayDevice } from "./utils/analyticsHistory";
import { coverageOf, withCoverage } from "./googleAnalyticsCoverage";
import { closeConnection } from "./googleAnalyticsRunEnd";
import { shiftDay } from "./searchConsoleDays";
import { numberPages } from "./googleAnalyticsPageNumbers";
import { askedAs, foldByKind } from "./googleAnalyticsLandingKinds";
import { pageKindsFrom } from "./utils/pageKinds";
import { startFirstCollection } from "./googleAnalyticsAgentRun";
import type { ReportRow, Report } from "./googleAnalyticsApi";
import type { GoogleFailure } from "./googleApi";
import {
  EVENT_LIST_METRICS,
  EVENT_METRICS,
  EVERY_DEVICE,
  SALES_METRICS,
  KEPT_BY_DEVICE,
  LIST_DIMENSIONS,
  MAIN_METRICS,
  ITEM_METRICS,
  SHOP_STEPS,
  fingerprint,
  groupKeys,
  isEventList,
  isItemList,
  listJoiner,
  packList,
  type Lead,
  slotKey,
  type ListRow,
  type PackedPart,
} from "./googleAnalyticsLists";
import { trimDue } from "./utils/analyticsSharedLists";
import { PART_ROWS } from "./utils/searchConsolePacks";
import {
  DAY_FACT_LISTS,
  PAGE_FACT_LISTS,
  SERIES_PERIOD,
  analyticsPackedRows,
  dayFactListValidator,
  type DayFactList,
  type AnalyticsList,
} from "./googleAnalyticsSchema";
import { AI_SOURCE_VALUES } from "./utils/aiAssistants";
import { SALE_EVENT, conversionAddressesOf, countsConversions } from "./utils/analyticsAddresses";
import { READ_EVENTS } from "./utils/analyticsPageStory";

/**
 * Collecting a website's Google Analytics (docs/plans/active/google-analytics-plan.md
 * §4): what the Google Analytics: Collector Agent's run for one website does,
 * a step at a time (`googleAnalyticsAgentRun.ts`).
 *
 * - **The days** of the two small lists — the totals and the channels — by
 *   device, for the charts: a website with nothing held gets the 60 days kept
 *   (§4.3), newest week first, a week a step; after that, the newest day and
 *   the last two again while Google's figures settle (GA23).
 * - **The ready-made periods** of all four lists, asked of Google ready-made
 *   and never added up from days (GA23): the 7 and 30 days and the span
 *   before each every day; the 90 days and 12 months, the span before and the
 *   same span a year before (§10, Q2) every week, with the long charts.
 *
 * Only what changed is written (GA23): a day's record whose figures did not
 * move, and a ready-made list whose fingerprint is the same, are left as they
 * are. A ready-made list is written whole into the slot screens are not
 * reading, then the slot flips, so a screen never reads half of one build.
 */

/** Days asked a step: a week. */
export const DAYS_PER_STEP = 7;

/** How long a step works before it hands on: an action stops at ten minutes. */
export const STEP_BUDGET_MS = 4 * 60 * 1000;

/** Ready-made parts written a call: each up to 2,000 rows. */
const PARTS_PER_WRITE = 4;

/**
 * Parts of a ready-made list removed a call: each up to 2,000 rows, a few hundred KB, read to be deleted — twelve
 * stay well inside a call's 16 MB (collection-reliability-plan.md, RR3; 64 and 64 more passed it on a big website).
 */
const PARTS_PER_DELETE = 12;

/** Live lists removed a call. */
const LIVE_PER_DELETE = 200;

/** A day's records of one list and device: its parts, each up to 2,000 rows — 200,000 rows a day. */
const DAY_RECORDS_READ = 100;

/** The devices Google Analytics names, and every device's own record: a full day's records are read a device at a time. */
const DAY_DEVICES = [EVERY_DEVICE, "desktop", "mobile", "tablet", "smart tv"] as const;

/** A day's parts written a call, each up to 2,000 rows: a big shop's day of products goes in several (RR3). */
const DAY_PARTS_A_WRITE = 24;

// What a run asks and for which dates, worked out from what is held (`googleAnalyticsJobs.ts`), named here as before.
export { REFETCH_DAYS, analyticsWindow, dueJobs, fetchedAfter, finishedDue, insightsYearJobs, newestWholeDayIn, periodRange, slotKey, type PeriodJob } from "./googleAnalyticsJobs";
import { periodRange, type PeriodJob } from "./googleAnalyticsJobs";
import { OPENING_PERIOD } from "./utils/calendarPeriods";

// ---------------------------------------------------------------------------
// What a step needs
// ---------------------------------------------------------------------------

/** What collecting a website needs: its property, addresses, key events and where its figures stand. */
export type CollectTarget = {
  status: Doc<"googleAnalyticsConnections">["status"];
  clearing: boolean;
  owned: boolean;
  companyWebsiteId: Id<"companyWebsites">;
  property: string | null;
  addresses: string[];
  origin: string;
  timeZone: string;
  /** The events listed on the connection: each row keeps their counts, so changing what counts re-prices every date. */
  events: string[];
  /** Those counted as conversions: the second step of each action's funnel (ga-conversions-visitors-plan.md CV4). */
  counted: string[];
  /** Those Google counts once a visit: counted by the visits they happened in (conversions-back-in-time-plan.md BT1). */
  perVisit: string[];
  /**
   * The property's other addresses whose conversions and sales count (conversion-addresses-plan.md): a shop, a
   * booking page. A list's conversions, sales and products are read on them beside `addresses`; its visits and its
   * pages never are.
   */
  alsoConverting: string[];
  /** Sales happen on one of them: Google's sales figures are read on them too, and the website is a shop from its first run. */
  salesElsewhere: boolean;
  newestDay: string | undefined;
  oldestDay: string | undefined;
  /** Each page is held over time (ga-stored-figures-plan.md SF5): the run then adds each new day to it. */
  pagesHeld: boolean;
  weeklyPeriodsAt: number | undefined;
  /** The finished periods fetched, each home country's (calendar-periods-plan.md, phase 6): which a run asks is worked out from them. */
  periodsFetched: Array<{ key: string; from: string; settled: boolean }>;
  /** The home country every ask is filtered to, by Google's two-letter `countryId`: the main one unless a job names another. */
  country: string;
  /** The website's other home countries, kept as ready-made lists (§18.6.1), by Search Console's code (`fra`). */
  others: string[];
  /** Where each other home country's days and pages stand (ga-stored-figures-plan.md SF7): the run adds its new days too. */
  countryHistory: Array<{ country: string; newestDay?: string; oldestDay?: string; pagesHeld: boolean }>;
  /**
   * No page title kept yet (§18.6.3): the run asks the weekly lists with the
   * titles whatever the week — every website the first time the second
   * round's figures are collected, and a new one at once.
   */
  untitled: boolean;
  /** A shop (§18.6.6): its products are asked beside the other lists. Sales on a conversion address make one too. */
  shop: boolean;
  /** The connection's own note that it is a shop (`noteShop`), read from its 90 days' events. */
  shopNoted: boolean;
  /** How far each two-year fill has got (ga-big-site-reliability-plan.md BR6). */
  fillsReached: Array<{ country: string; fill: string; to: string }>;
  /**
   * No list of every event, campaign or visitor kept yet (§18.6.5, §18.6.6)
   * — the interests came last, so their list says for all: the weekly lists
   * are asked at once too, so the longer periods never wait a week.
   */
  eventless: boolean;
};

/** Google Analytics' two-letter `countryId` for Search Console's code: `gbr` → `GB`. */
export function countryIdOf(code: string): string {
  return ALPHA3_TO_ALPHA2[code.toUpperCase()] ?? "GB";
}

/** The listed events Google counts once a visit (BT1). */
export function perVisitOf(connection: Pick<Doc<"googleAnalyticsConnections">, "events">): string[] {
  return (connection.events ?? []).filter((event) => event.perVisit === true).map((event) => event.eventName);
}

/** The other addresses a connection's conversions and sales are read on, and whether sales happen on any (conversion-addresses-plan.md). */
export function conversionTargetOf(connection: Pick<Doc<"googleAnalyticsConnections">, "addressesRead">): Pick<CollectTarget, "alsoConverting" | "salesElsewhere"> {
  const counting = (connection.addressesRead ?? []).filter((address) => countsConversions(address));
  return {
    alsoConverting: conversionAddressesOf(counting),
    salesElsewhere: counting.some((address) => address.events.some((event) => event.eventName === SALE_EVENT && event.year > 0)),
  };
}

export const collectTarget = internalQuery({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  handler: async (ctx, args): Promise<CollectTarget | null> => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    const website = await ctx.db.get(connection.websiteId);
    const addresses = connection.addresses ?? (website ? [website.host] : []);
    const converting = conversionTargetOf(connection);
    return {
      status: connection.status,
      clearing: connection.clearing === true,
      owned: hold !== null && !isTrackedHold(hold),
      companyWebsiteId: connection.companyWebsiteId,
      property: connection.property ?? null,
      addresses,
      origin: siteOrigin(addresses, website?.host ?? ""),
      timeZone: connection.timeZone ?? "Europe/London",
      events: (connection.events ?? []).map((event) => event.eventName),
      counted: (connection.events ?? []).filter((event) => event.counted).map((event) => event.eventName),
      perVisit: perVisitOf(connection),
      ...converting,
      newestDay: connection.newestDay,
      oldestDay: connection.oldestDay,
      pagesHeld: connection.pageHistoryFrom !== undefined,
      weeklyPeriodsAt: connection.weeklyPeriodsAt,
      periodsFetched: connection.periodsFetched ?? [],
      country: countryIdOf(hold ? mainConsoleCountry(hold) : "gbr"),
      others: hold && !isTrackedHold(hold) ? await countriesKeptReady(ctx, hold) : [],
      countryHistory: (connection.countryHistory ?? []).map((one) => ({ country: one.country, newestDay: one.newestDay, oldestDay: one.oldestDay, pagesHeld: one.pageHistoryFrom !== undefined })),
      untitled: (await ctx.db.query("googleAnalyticsTitles").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId)).first()) === null,
      shop: connection.shop === true || converting.salesElsewhere,
      shopNoted: connection.shop === true,
      fillsReached: connection.fillsReached ?? [],
      // A shop's first products are asked at once too, as every new list was.
      eventless: (await ctx.db
        .query("googleAnalyticsPeriodSlots")
        .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", slotKey(connection.shop ? "product" : "interest", OPENING_PERIOD, "NOW", "")))
        .first()) === null
        // Insights' two lists (insights-analyst-plan.md I35, §8) asked at once too, rather than a week later.
        || (await ctx.db
          .query("googleAnalyticsPeriodSlots")
          .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", slotKey("firstChannel", OPENING_PERIOD, "NOW", "")))
          .first()) === null,
    };
  },
});

// A step's hold on Google — its sign-in, its asks, waiting when Google is busy — in its own module, named here as before.
export { ask, askFunnel, askRealtime, openSession, type Session } from "./googleAnalyticsSession";
import { ask, type Session } from "./googleAnalyticsSession";

// Each run's budget for the hour, and Google's refusals that refresh within it (ga-stored-figures-plan.md SF17, SF20).
export { HOURLY_REFUSAL, KEPT_BACK, overBudget } from "./googleAnalyticsBudget";
import { HOURLY_REFUSAL } from "./googleAnalyticsBudget";

export type Asked = { ok: true; groups: Map<string, ListRow[]>; flags: { folded: boolean; thresholded: boolean; cut: boolean } } | GoogleFailure;

/** Dimensions that place a figure on a page: a list split by one keeps every figure to the website's own address. */
const ON_A_PAGE: ReadonlySet<string> = new Set(["pagePath", "pageReferrer", "linkUrl"]);

/**
 * A list's two asks — its figures and its key events — joined (`joinAsks`):
 * for one device, or one landing page, when a screen asks live (GA20, GA22).
 * A website with conversion addresses (conversion-addresses-plan.md) reads a
 * list's key events, converting visits, products and an event list's listed
 * events on them too, and its sales in an ask of their own when sales happen
 * there.
 */
export async function askList(
  session: Session,
  target: CollectTarget,
  list: AnalyticsList,
  lead: readonly Lead[],
  range: { from: string; to: string },
  only: { device?: string; landingPage?: string[]; pagePath?: string[] } = {},
  /**
   * `converting`: a third ask, the visits that made any listed event, each once (`sessions` filtered to the events, no
   * split by event) — landing pages by channel for the dates now (ga-conversions-visitors-plan.md CV8).
   * `trim`: a page list's own cut (ga-big-site-reliability-plan.md BR3), made as Google's answers arrive once more than
   * `TRIM_ABOVE` rows are held, so a big website's list is never held whole.
   */
  also: { converting?: boolean; trim?: (rows: ListRow[]) => ListRow[]; hold?: number } = {},
): Promise<Asked> {
  const dimensions = [...lead, ...LIST_DIMENSIONS[list]];
  // Conversions, sales and products read on the website's conversion addresses too (conversion-addresses-plan.md): a
  // sale on the shop credited to the visit's landing page and source. Never a list split by page: a page's own figures
  // are what happened on it.
  const wide = target.alsoConverting.length > 0 && only.pagePath === undefined && !dimensions.some((dimension) => ON_A_PAGE.has(dimension));
  const converting = wide ? [...target.addresses, ...target.alsoConverting] : target.addresses;
  const base = {
    startDate: range.from,
    endDate: range.to,
    hostNames: target.addresses,
    countries: [target.country],
    ...(only.device ? { device: only.device } : {}),
    ...(only.landingPage !== undefined ? { only: { dimension: "landingPage", values: only.landingPage } }
      : only.pagePath !== undefined ? { only: { dimension: "pagePath", values: only.pagePath } }
        // Only the assistants' visits: a list of every source by every landing page would be a website's longest.
        : list === "landingAssistant" ? { only: { dimension: "sessionSource", values: [...AI_SOURCE_VALUES] } }
          // Only the counted events, by day of the week and hour: every event's 168 cells would be a website's longest list.
          : list === "eventHour" ? { only: { dimension: "eventName", values: [...target.events] } } : {}),
  };
  const metrics = isEventList(list) ? EVENT_LIST_METRICS : isItemList(list) ? ITEM_METRICS : MAIN_METRICS;
  // Sales asked apart only where they happen on another address: a booking page's list asks nothing more.
  const salesApart = wide && target.salesElsewhere && !isEventList(list) && !isItemList(list);
  // Each answer joined as it arrives, and a page list trimmed while it is read (BR2, BR3).
  const joined = listJoiner(list, lead, new Set(target.perVisit), { salesApart });
  const due = trimDue(also.hold);
  const trimmed = (add: (rows: ReportRow[]) => void) => (rows: ReportRow[]) => {
    add(rows);
    if (also.trim && due.now(joined.size())) {
      joined.trim(also.trim);
      due.after(joined.size());
    }
  };
  // A product list is the shop's: every address whose sales count.
  const main = await ask(session, target.property!, { ...base, ...(wide && isItemList(list) ? { hostNames: converting } : {}), dimensions, metrics: [...metrics] }, trimmed((rows) => joined.addMain(rows)));
  if (!main.ok) return main;
  const answers: Report[] = [main];
  if (wide && isEventList(list)) {
    // The listed events and a shop's steps on every address that counts; every other event the website's own.
    const answer = await ask(session, target.property!, {
      ...base,
      hostNames: converting,
      dimensions,
      metrics: [...EVENT_LIST_METRICS],
      eventNames: [...new Set([...target.events, ...SHOP_STEPS])],
    }, trimmed(joined.replaceEvents()));
    if (!answer.ok) return answer;
    answers.push(answer);
  }
  if (salesApart) {
    const answer = await ask(session, target.property!, { ...base, hostNames: converting, dimensions, metrics: [...SALES_METRICS] }, trimmed((rows) => joined.addSales(rows)));
    if (!answer.ok) return answer;
    answers.push(answer);
  }
  let events: ({ ok: true } & Report) | null = null;
  // An event list counts every event itself, and a product list cannot be split by event: no key events to join (§18.6.5, §18.6.6).
  if (target.events.length > 0 && !isEventList(list) && !isItemList(list)) {
    const answer = await ask(session, target.property!, {
      ...base,
      hostNames: converting,
      dimensions: [...dimensions, "eventName"],
      metrics: [...EVENT_METRICS],
      eventNames: target.events,
    }, trimmed((rows) => joined.addEvents(rows)));
    if (!answer.ok) return answer;
    events = answer;
  }
  if (also.converting && target.events.length > 0) {
    const answer = await ask(session, target.property!, { ...base, hostNames: converting, dimensions, metrics: ["sessions"], eventNames: target.events }, trimmed((rows) => joined.addConverting(rows)));
    if (!answer.ok) return answer;
  }
  if (also.trim) joined.trim(also.trim);
  return {
    ok: true,
    groups: joined.groups(),
    flags: {
      folded: answers.some((answer) => answer.folded) || (events?.folded ?? false),
      thresholded: answers.some((answer) => answer.thresholded) || (events?.thresholded ?? false),
      cut: answers.some((answer) => answer.cut) || (events?.cut ?? false),
    },
  };
}

/**
 * Where a website's pages are, as its page numbers name them: the address its
 * visits are read on (`hostName`, `www.` and all), so a page reads as Search
 * Console names it — never the web stream's own address, which may leave
 * `www.` off (our own agency's site's does).
 */
export function siteOrigin(addresses: readonly string[], host: string): string {
  return `https://${(addresses[0] ?? host).toLowerCase()}`;
}


// ---------------------------------------------------------------------------
// The days
// ---------------------------------------------------------------------------

/**
 * A step's outcome. A stop that is only the hour's allowance — the run's own
 * budget spent, or Google refusing for an allowance that refreshes within the
 * hour — is `wait`: the run carries on once the hour turns (SF17, SF20).
 */
export type StepResult =
  | {
      ok: true;
      rows: number;
      requests: number;
      /** An answer reached Google's row limit, and the rows past it are not in what was kept: said on the run (RR2). */
      cut?: boolean;
      /**
       * Google refused a funnel held to the conversion addresses, so it was asked on the website's own address
       * (conversion-addresses-plan.md): said on the run, with those addresses.
       */
      narrowed?: string[];
    }
  | { ok: false; reason: string; access: boolean; busy: boolean; wait: boolean; requests: number };

export function failed(session: Session, failure: GoogleFailure | null): Extract<StepResult, { ok: false }> {
  const wait = failure?.reason === "BUDGET" || (failure?.reason === "BUSY" && HOURLY_REFUSAL.test(failure.detail));
  return {
    ok: false,
    reason: session.stopped ?? (failure ? (failure.reason === "BUDGET" ? failure.detail : `${failure.reason} ${failure.status}: ${failure.detail}`) : "No detail given."),
    access: failure?.reason === "ACCESS",
    busy: !wait && (session.stopped === "GOOGLE_BUSY" || failure?.reason === "BUSY" || failure?.reason === "UNREACHABLE"),
    wait,
    requests: session.requests,
  };
}

/**
 * The day facts a website keeps (ga-stored-figures-plan.md SF12): its totals
 * and channels always; each event, each campaign and new and returning
 * people; a shop's products.
 */
export function dayFactsOf(target: Pick<CollectTarget, "shop">): DayFactList[] {
  return DAY_FACT_LISTS.filter((list) => list !== "product" || target.shop);
}


/**
 * A week of days, newest first: each day fact by day and device (SF12), each
 * day written as one record per list and device. A day Google has nothing
 * for is written with its figures at nought, so it reads as held.
 *
 * One list at a time, asked, written and let go before the next
 * (collection-reliability-plan.md, RR2); a list whose last week held more
 * than `SPLIT_ROWS` rows — a big shop's products — a day an ask.
 */
export async function collectDays(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  range: { from: string; to: string },
  lists: readonly DayFactList[] = dayFactsOf(target),
  /** Another home country (SF7), by its code (`fra`): asked for it alone, kept beside the main one's (`dayDevice`). */
  country?: string,
): Promise<StepResult> {
  const asking = country ? { ...target, country: countryIdOf(country) } : target;
  const days: string[] = [];
  for (let day = range.to; day >= range.from; day = shiftDay(day, -1)) days.push(day);
  const weeks: Record<string, { parts: number }> = await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, {
    companyWebsiteId: target.companyWebsiteId,
    keys: lists.map((list) => slotKey(askedAs(list), "lastWeek", "NOW", EVERY_DEVICE, country ?? "")),
  });
  // The website's classification, read once a call, for the landing pages by kind.
  const kinds = lists.includes("landingKind")
    ? await ctx.runQuery(internal.pageKinds.pageKindSetupOf, { holdId: target.companyWebsiteId }).then((setup) => (setup ? pageKindsFrom(setup) : null))
    : null;
  let rows = 0;
  let cut = false;
  // Each day's records, packed — Google's rows let go as each list is packed — and written once a day for every list.
  type DayRecord = { list: DayFactList; device: string; parts: PackedPart[]; folded: boolean; thresholded: boolean; cut: boolean };
  const byDay = new Map<string, DayRecord[]>(days.map((day) => [day, []]));
  for (const list of lists) {
    const asked_ = askedAs(list);
    const big = (weeks[slotKey(asked_, "lastWeek", "NOW", EVERY_DEVICE, country ?? "")]?.parts ?? 0) * PART_ROWS > SPLIT_ROWS;
    for (const span of big ? days.map((day) => ({ from: day, to: day })) : [range]) {
      const asked = await askList(session, asking, asked_, ["date", "deviceCategory"], span);
      if (!asked.ok) return failed(session, asked);
      cut ||= asked.flags.cut;
      for (let day = span.to; day >= span.from; day = shiftDay(day, -1)) {
        const devices = new Map<string, ListRow[]>();
        for (const [group, groupRows] of asked.groups) {
          const [groupDay, device] = groupKeys(group);
          if (groupDay === day) devices.set(device, groupRows);
        }
        if (!devices.has(EVERY_DEVICE)) devices.set(EVERY_DEVICE, []);
        for (const [device, groupRows] of devices) {
          const dayRows = list === "landingKind" ? foldByKind(groupRows, kinds, target.origin) : groupRows;
          rows += dayRows.length;
          byDay.get(day)!.push({ list, device: dayDevice(device, country), parts: packList(asked_, dayRows, target.events), ...asked.flags });
        }
      }
    }
  }
  for (const day of days) {
    // A day's records a few parts a write at most (RR3): a big shop's day of products is many.
    const records = byDay.get(day)!;
    for (let first = 0; first < records.length;) {
      let parts = 0;
      let last = first;
      while (last < records.length && (last === first || parts + records[last].parts.length <= DAY_PARTS_A_WRITE)) {
        parts += records[last].parts.length;
        last += 1;
      }
      // Never a list split across two writes: a write replaces each of its lists' days whole.
      while (last < records.length && records[last].list === records[last - 1].list) last += 1;
      await ctx.runMutation(internal.googleAnalyticsCollect.writeDay, {
        connectionId,
        property: target.property!,
        day,
        records: records.slice(first, last),
        fetchedAt: Date.now(),
        ...(country ? { country } : {}),
      });
      first = last;
    }
    byDay.delete(day);
  }
  return { ok: true, rows, requests: session.requests, ...(cut ? { cut: true } : {}) };
}

const packedPartValidator = v.object(analyticsPackedRows);

/** A day's records, written only where their figures moved; a device Google no longer names that day goes. */
export const writeDay = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    day: v.string(),
    records: v.array(v.object({
      list: dayFactListValidator,
      device: v.string(),
      parts: v.array(packedPartValidator),
      folded: v.boolean(),
      thresholded: v.boolean(),
      cut: v.boolean(),
    })),
    fetchedAt: v.number(),
    /** Another home country's day (SF7): its records alone are written, and its days noted. */
    country: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Disconnected, or another property chosen, while the step ran: what it fetched is not this connection's.
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return null;
    // A home country taken off while the step ran is not filed again behind its clearing.
    if (args.country && !(await stillKeptReady(ctx, connection.companyWebsiteId, args.country))) return null;
    const hold = connection.companyWebsiteId;
    const country = args.country ?? "";
    // Only the lists fetched: a fill of one list leaves the others' days as they are.
    for (const list of [...new Set(args.records.map((record) => record.list))]) {
      const fresh = args.records.filter((record) => record.list === list);
      // Only this home country's records: each country's sit beside the others' (`dayDevice`). One read of the list's
      // day — and when it is full, device by device, all their parts (RR3): the one read stopped at 100, and a big day's
      // records past it were written again beside themselves.
      const whole = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", hold).eq("list", list).eq("day", args.day))
        .take(DAY_RECORDS_READ);
      let held = whole.filter((row) => countryOfDayDevice(row.device) === country);
      if (whole.length === DAY_RECORDS_READ) {
        held = [];
        for (const device of new Set([...fresh.map((record) => record.device), ...DAY_DEVICES.map((one) => dayDevice(one, args.country))])) {
          held.push(...await ctx.db
            .query("googleAnalyticsDays")
            .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", hold).eq("list", list).eq("day", args.day).eq("device", device))
            .take(DAY_RECORDS_READ));
        }
      }
      for (const record of fresh) {
        for (const [part, packed] of record.parts.entries()) {
          const before = held.find((row) => row.device === record.device && row.part === part);
          const flags = { folded: record.folded || undefined, thresholded: record.thresholded || undefined, cut: record.cut || undefined };
          if (!before) {
            await ctx.db.insert("googleAnalyticsDays", { companyWebsiteId: hold, list, device: record.device, day: args.day, part, ...packed, ...flags, fetchedAt: args.fetchedAt });
          } else if (!samePart(before, packed)) {
            await ctx.db.patch(before._id, { ...packed, ...flags, fetchedAt: args.fetchedAt });
          }
        }
      }
      // A device Google no longer names that day goes, and a part past a device's new count.
      for (const row of held) {
        const kept = fresh.find((record) => record.device === row.device);
        if (!kept || row.part >= kept.parts.length) await ctx.db.delete(row._id);
      }
    }
    const coverage = coverageOf(connection, country);
    const newestDay = !coverage.newestDay || args.day > coverage.newestDay ? args.day : coverage.newestDay;
    const oldestDay = !coverage.oldestDay || args.day < coverage.oldestDay ? args.day : coverage.oldestDay;
    await ctx.db.patch(connection._id, country
      ? { countryHistory: withCoverage(connection, country, { newestDay, oldestDay }), updatedAt: Date.now() }
      : { newestDay, oldestDay, updatedAt: Date.now() });
    return null;
  },
});

function samePart(held: PackedPart, fresh: PackedPart): boolean {
  return held.visits === fresh.visits && held.engaged === fresh.engaged && held.seconds === fresh.seconds && held.views === fresh.views
    && held.purchases === fresh.purchases && held.revenue === fresh.revenue
    && held.people === fresh.people && held.newPeople === fresh.newPeople && held.length === fresh.length
    && JSON.stringify(held.keys) === JSON.stringify(fresh.keys) && JSON.stringify(held.events) === JSON.stringify(fresh.events)
    && JSON.stringify(held.counts) === JSON.stringify(fresh.counts) && JSON.stringify(held.values) === JSON.stringify(fresh.values);
}

// ---------------------------------------------------------------------------
// The ready-made periods
// ---------------------------------------------------------------------------

/** Where each ready-made list stands: the slot screens read, and the fingerprint and dates of what is in it. */
export const slotsOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out: Record<string, { slot: number; hash: string; from: string; to: string; parts: number }> = {};
    for (const key of args.keys) {
      const slot = await ctx.db
        .query("googleAnalyticsPeriodSlots")
        .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("key", key))
        .first();
      if (slot) out[key] = { slot: slot.slot, hash: slot.hash, from: slot.from, to: slot.to, parts: slot.parts };
    }
    return out;
  },
});

/** A few parts of a build, into the slot screens are not reading. */
/** Whether a kept list's name is one of the shared page lists, sorted by page (SF13). */
function sortedByPage(key: string): boolean {
  return (PAGE_FACT_LISTS as readonly string[]).includes(key.split("|")[0]);
}

export const putPeriodParts = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    key: v.string(),
    slot: v.number(),
    first: v.number(),
    parts: v.array(packedPartValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return false;
    const hold = connection.companyWebsiteId;
    for (const [at, packed] of args.parts.entries()) {
      const part = args.first + at;
      const held = await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key).eq("slot", args.slot).eq("part", part))
        .first();
      // A list sorted by page keeps its first key, for a page's rows to be read alone (SF13).
      const firstKey = sortedByPage(args.key) ? packed.keys[0] : undefined;
      if (held) await ctx.db.patch(held._id, { ...packed, firstKey });
      else await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: hold, key: args.key, slot: args.slot, part, ...packed, ...(firstKey !== undefined ? { firstKey } : {}) });
    }
    return true;
  },
});

/**
 * The build complete: screens read it from now on, and the build it replaces
 * goes. A query reads a slot and its parts at one moment, so no screen reads
 * half of one build.
 */
export const flipSlot = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    key: v.string(),
    slot: v.number(),
    parts: v.number(),
    from: v.string(),
    to: v.string(),
    hash: v.string(),
    folded: v.boolean(),
    thresholded: v.boolean(),
    cut: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return null;
    const hold = connection.companyWebsiteId;
    const flags = { folded: args.folded || undefined, thresholded: args.thresholded || undefined, cut: args.cut || undefined };
    const held = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key))
      .first();
    const now = Date.now();
    if (held) {
      await ctx.db.patch(held._id, { slot: args.slot, parts: args.parts, from: args.from, to: args.to, hash: args.hash, ...flags, builtAt: now });
    } else {
      await ctx.db.insert("googleAnalyticsPeriodSlots", {
        companyWebsiteId: hold, key: args.key, slot: args.slot, parts: args.parts, from: args.from, to: args.to, hash: args.hash, ...flags, builtAt: now,
      });
    }
    // This build's parts past its own count, and the whole of the build it replaces: a few now, the rest after.
    if (await dropSomeStale(ctx, hold, args.key, args.slot, args.parts)) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropStaleParts, { companyWebsiteId: hold, key: args.key, slot: args.slot, parts: args.parts });
    }
    return null;
  },
});

/** A few of a list's stale parts gone — past its build's count, and the build it replaced: true while more are left. */
async function dropSomeStale(ctx: MutationCtx, hold: Id<"companyWebsites">, key: string, slot: number, parts: number): Promise<boolean> {
  const past = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", key).eq("slot", slot).gte("part", parts))
    .take(PARTS_PER_DELETE);
  const replaced = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", key).eq("slot", 1 - slot))
    .take(PARTS_PER_DELETE);
  for (const part of [...past, ...replaced]) await ctx.db.delete(part._id);
  return past.length === PARTS_PER_DELETE || replaced.length === PARTS_PER_DELETE;
}

/**
 * The rest of a list's stale parts, a few a call until none is left (RR3): until 2026-10-15 a flip removed 64 and left
 * any past them for good, where a page's own read (`readPageRows`) could find them. A slot flipped again since keeps
 * its newer build's parts: only what is stale now goes.
 */
export const dropStaleParts = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), key: v.string(), slot: v.number(), parts: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("key", args.key))
      .first();
    if (!held) return null;
    if (await dropSomeStale(ctx, args.companyWebsiteId, args.key, held.slot, held.parts)) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropStaleParts, { ...args, slot: held.slot, parts: held.parts });
    }
    return null;
  },
});

/**
 * One ready-made list, asked of Google ready-made: for every device, and for
 * each device when the list is kept by device. Each device's build is written
 * into the slot screens are not reading, then flipped — unless its figures
 * did not move since the last build (GA23).
 */
export async function collectPeriod(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  job: PeriodJob,
  top: string,
  /** The second try at this list after the platform stopped it (collection-reliability-plan.md, RR1): smaller pieces. */
  how: { careful?: boolean } = {},
): Promise<StepResult> {
  const range = periodRange(job.period, job.which, top);
  // Google has sent none of the period yet: nothing to ask (its jobs are planned only once it has).
  // Nor for the counted events by hour (`eventHour`) when the website counts none.
  if (!range || (job.list === "eventHour" && target.events.length === 0)) return { ok: true, rows: 0, requests: session.requests };
  const country = job.country ?? "";
  const asking = country ? { ...target, country: countryIdOf(country) } : target;
  // All pages count their reading too — a page's views and scrolls — for its story and its group's (SF13).
  const reading = job.list === "page" ? { ...asking, events: [...asking.events, ...READ_EVENTS] } : asking;
  // Landing pages by channel for the dates now also count the visits that made any listed event: Conversions' flow (CV8),
  // which reads the calendar periods only — Insights' 12 months never ask it.
  const also = { converting: job.list === "landingChannel" && job.which === "NOW" && job.period !== SERIES_PERIOD };
  const keyOf = (device: string) => slotKey(job.list, job.period, job.which, device, country);
  const held: Record<string, { slot: number; hash: string; from: string; to: string; parts: number }> =
    await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, { companyWebsiteId: target.companyWebsiteId, keys: [EVERY_DEVICE, ...SPLIT_DEVICES].map(keyOf) });
  // A big website's list by device is asked a device at a time, each written and let go before the next (RR2): one ask
  // of every device at once held them all — a 10,000-page website's landing pages by channel, 750,000 rows. Judged by
  // its last build, and always on a careful second try.
  // Insights' 12 months are read for every device only (option C): never asked or kept by device.
  const byDevice = job.period !== SERIES_PERIOD && KEPT_BY_DEVICE[job.list];
  const split = byDevice && (how.careful === true || (held[keyOf(EVERY_DEVICE)]?.parts ?? 0) * PART_ROWS > SPLIT_ROWS);
  let rows = 0;
  let cut = false;
  const writeDevice = async (device: string, deviceRows: ListRow[], flags: { folded: boolean; thresholded: boolean; cut: boolean }) => {
    const listRows = job.list === "landing" || job.list === "page" || job.list === "landingChannel" || job.list === "landingAssistant"
      ? await numberPages(ctx, target, deviceRows, job.list)
      : deviceRows;
    rows += listRows.length;
    cut ||= flags.cut;
    const key = keyOf(device);
    return await writeList(ctx, connectionId, target, job.list, key, listRows, range, flags, held[key], reading.events);
  };
  const ended = (): StepResult => ({ ok: true, rows, requests: session.requests, ...(cut ? { cut: true } : {}) });
  if (split) {
    for (const device of [...SPLIT_DEVICES, EVERY_DEVICE]) {
      const asked = await askList(session, reading, job.list, [], range, device === EVERY_DEVICE ? {} : { device }, also);
      if (!asked.ok) return failed(session, asked);
      if (job.list === "event" && device === EVERY_DEVICE) await noteShopFrom(ctx, connectionId, target, job, asked);
      if (!(await writeDevice(device, [...asked.groups.values()].flat(), asked.flags))) return ended();
    }
    return ended();
  }
  const lead = byDevice ? (["deviceCategory"] as const) : ([] as const);
  const asked = await askList(session, reading, job.list, lead, range, {}, also);
  if (!asked.ok) return failed(session, asked);
  const devices = new Map<string, ListRow[]>();
  for (const [group, groupRows] of asked.groups) devices.set(lead.length > 0 ? groupKeys(group)[0] : EVERY_DEVICE, groupRows);
  if (job.list === "event") await noteShopFrom(ctx, connectionId, target, job, asked);
  // People cannot be added up across devices (§18.6.2): every device is asked whole, as the website's totals always
  // were — the channels aside, whose people no screen shows for every device.
  let wholeFlags = asked.flags;
  if (lead.length > 0 && job.list !== "channel") {
    const whole = await askList(session, reading, job.list, [], range, {}, also);
    if (!whole.ok) return failed(session, whole);
    devices.set(EVERY_DEVICE, [...whole.groups.values()].flat());
    wholeFlags = whole.flags;
  }
  if (!devices.has(EVERY_DEVICE)) devices.set(EVERY_DEVICE, []);
  for (const [device, deviceRows] of devices) {
    // A device's held for a slot read with the rest: one the website had none of before is read now.
    const key = keyOf(device);
    if (!(key in held)) Object.assign(held, await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, { companyWebsiteId: target.companyWebsiteId, keys: [key] }));
    if (!(await writeDevice(device, deviceRows, device === EVERY_DEVICE ? wholeFlags : asked.flags))) return ended();
    devices.delete(device);
  }
  return ended();
}

/** The devices a big website's list is asked for one at a time (RR2), with every device's beside them. */
const SPLIT_DEVICES = ["desktop", "mobile", "tablet"] as const;

/** Rows past which a list's last build says its devices are asked one at a time: a lead ask would hold four times as many. */
export const SPLIT_ROWS = 25_000;

/**
 * A shop is one with any of its four steps in the last 3 months (§18.6.6; sees-header-and-rolling-dates-plan.md, part
 * two; this quarter or last until 2026-10-29): noted a shop when those months' events show a step, and no longer one
 * once they show none.
 */
async function noteShopFrom(ctx: ActionCtx, connectionId: Id<"googleAnalyticsConnections">, target: CollectTarget, job: PeriodJob, asked: Extract<Asked, { ok: true }>) {
  if (job.period !== "last3Months" || job.which !== "NOW" || job.country) return;
  const shop = [...asked.groups.values()].flat().some((row) => (SHOP_STEPS as readonly string[]).includes(row.key) && (row.times ?? 0) > 0);
  const changed = shop ? !target.shopNoted : target.shopNoted;
  if (changed) await ctx.runMutation(internal.googleAnalyticsCollect.noteShop, { connectionId, property: target.property!, shop });
}

/**
 * A ready-made list's rows written into the slot screens are not reading,
 * then the slot flipped — unless its figures and dates are as held. False
 * when the connection changed under the write.
 */
export async function writeList(
  ctx: ActionCtx,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  list: AnalyticsList,
  key: string,
  /** Its rows, or its parts packed already: a big website's page list gathered a group of pages at a time (`CompactRows`). */
  rows: readonly ListRow[] | { parts: PackedPart[] },
  range: { from: string; to: string },
  flags: { folded: boolean; thresholded: boolean; cut: boolean },
  held: { slot: number; hash: string; from: string; to: string } | undefined,
  /** The events given columns: the key events unless the list asked others. */
  events: readonly string[] = target.events,
): Promise<boolean> {
  const parts = "parts" in rows ? rows.parts : packList(list, rows, events);
  const hash = await fingerprint(parts);
  if (held && held.hash === hash && held.from === range.from && held.to === range.to) return true;
  const slot = held ? 1 - held.slot : 0;
  for (let first = 0; first < parts.length; first += PARTS_PER_WRITE) {
    const written: boolean = await ctx.runMutation(internal.googleAnalyticsCollect.putPeriodParts, {
      connectionId, property: target.property!, key, slot, first, parts: parts.slice(first, first + PARTS_PER_WRITE),
    });
    if (!written) return false;
  }
  await ctx.runMutation(internal.googleAnalyticsCollect.flipSlot, {
    connectionId, property: target.property!, key, slot, parts: parts.length, from: range.from, to: range.to, hash, ...flags,
  });
  return true;
}

/** Whether the website is a shop, as its last 90 days' events say (§18.6.6). */
export const noteShop = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), shop: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    // Newly a shop: the finished periods were fetched without its products, so they are asked again, products and all,
    // by the next run (calendar-periods-plan.md, phase 6) — else Products' Last Month would wait for the month to roll.
    const refetch = args.shop && connection.shop !== true;
    await ctx.db.patch(connection._id, { shop: args.shop || undefined, ...(refetch ? { periodsFetched: undefined, shopNotedAt: Date.now() } : {}), updatedAt: Date.now() });
    return null;
  },
});

/**
 * The run's last word on the connection, for a run that asked every list: the
 * one closing every ending goes through (`googleAnalyticsRunEnd.ts`), as far as
 * a whole run reaches.
 */
export const finishCollection = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    weekly: v.boolean(),
    firstDone: v.boolean(),
    /** Every address's visits over the 30 days, asked with the weekly lists: the strangers check. */
    hostVisits: v.optional(v.array(v.object({ host: v.string(), visits: v.number() }))),
    /** The run collected it again, whole, by Google's own counts (conversions-back-in-time-plan.md BT4). */
    recount: v.optional(v.boolean()),
    /**
     * When the night's run began (ga-big-site-reliability-plan.md BR7): the two-year fills start only after a night's
     * collection, never after the first one on connecting, and wait for the hour inside that night.
     */
    nightFrom: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await closeConnection(ctx, {
      connectionId: args.connectionId,
      property: args.property,
      reached: "WHOLE",
      weekly: args.weekly,
      recount: args.recount === true,
      ...(args.hostVisits ? { hostVisits: args.hostVisits } : {}),
      ...(args.nightFrom !== undefined ? { nightFrom: args.nightFrom } : {}),
      fills: true,
    });
    return null;
  },
});


/** How long an event's funnel, asked when its screen opens, is kept (ga-stored-figures-plan.md SF8). */
export const FUNNEL_KEPT_MS = 7 * 86_400_000;

/** The start of every funnel's name (`googleAnalyticsLive.eventAsk`), and the first name past them. */
const FUNNEL_ASKS = { from: "funnel:", past: "funnel;" } as const;

/**
 * Lists a screen asked of Google live, held until the next collection (GA23),
 * a few hundred at a time — but an event's funnel, kept a week (SF8).
 */
export const dropLive = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const live = () => ctx.db.query("googleAnalyticsLive");
    const held = [
      ...await live().withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).lt("ask", FUNNEL_ASKS.from)).take(LIVE_PER_DELETE),
      ...await live().withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).gte("ask", FUNNEL_ASKS.past)).take(LIVE_PER_DELETE),
    ].slice(0, LIVE_PER_DELETE);
    const funnels = await live()
      .withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).gte("ask", FUNNEL_ASKS.from).lt("ask", FUNNEL_ASKS.past))
      .take(LIVE_PER_DELETE);
    const old = funnels.filter((row) => row.askedAt < Date.now() - FUNNEL_KEPT_MS);
    for (const row of [...held, ...old]) await ctx.db.delete(row._id);
    if (held.length === LIVE_PER_DELETE) await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropLive, args);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

/** Records removed a call when a website's figures go. */
const CLEAR_PER_CALL = 200;

/** Some of a website's figures gone — its days, ready-made lists, live lists and page titles; true when none is left. */
async function clearSome(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  let done = true;
  const days = await ctx.db.query("googleAnalyticsDays").withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  const periods = await ctx.db.query("googleAnalyticsPeriods").withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(PARTS_PER_DELETE);
  const slots = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  const live = await ctx.db.query("googleAnalyticsLive").withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  const titles = await ctx.db.query("googleAnalyticsTitles").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  // The channels' weeks and months, and each page over time (ga-stored-figures-plan.md SF2, SF5).
  const history = await ctx.db.query("googleAnalyticsHistory").withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  const pageSeries = await ctx.db.query("googleAnalyticsPageSeries").withIndex("by_hold_last", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  for (const row of [...days, ...periods, ...slots, ...live, ...titles, ...history, ...pageSeries]) await ctx.db.delete(row._id);
  if (days.length === CLEAR_PER_CALL || periods.length === PARTS_PER_DELETE || slots.length === CLEAR_PER_CALL || live.length === CLEAR_PER_CALL
    || titles.length === CLEAR_PER_CALL || history.length === CLEAR_PER_CALL || pageSeries.length === CLEAR_PER_CALL) done = false;
  return done;
}

/**
 * A website's figures go, a batch at a time — another property chosen, whose
 * figures are never mixed with the last one's. The connection is collected
 * again once they are gone.
 */
export const clearFigures = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await clearSome(ctx, args.companyWebsiteId))) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.clearFigures, args);
      return null;
    }
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (connection?.clearing) {
      await ctx.db.patch(connection._id, {
        clearing: undefined, newestDay: undefined, oldestDay: undefined, backfilledAt: undefined, historyFrom: undefined, historyFilled: undefined, pageHistoryFrom: undefined, pageChannelsFrom: undefined, countryHistory: undefined, listsFrom: undefined, quotaSeen: undefined, fillsReached: undefined,
        dailyPeriodsAt: undefined, weeklyPeriodsAt: undefined, periodsFetched: undefined, updatedAt: Date.now(),
      });
      // The new property's figures start coming in at once (§10, Q15).
      if (connection.status === "CONNECTED") await startFirstCollection(ctx, (await ctx.db.get(connection._id))!);
    }
    return null;
  },
});

/** A website the company no longer holds: every figure Analytics brought, then its connection. */
export const purgeFigures = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await clearSome(ctx, args.companyWebsiteId))) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.purgeFigures, args);
      return null;
    }
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (connection) await ctx.db.delete(connection._id);
    return null;
  },
});
