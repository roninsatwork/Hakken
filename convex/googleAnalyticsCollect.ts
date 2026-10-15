import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isTrackedHold } from "./utils/websitePairing";
import { ALPHA3_TO_ALPHA2 } from "./utils/countryCodes";
import { countriesKeptReady, mainConsoleCountry, stillKeptReady } from "./searchConsoleCountries";
import { ANALYTICS_DAYS_KEPT as DAYS_KEPT, countryOfDayDevice, dayDevice } from "./utils/analyticsHistory";
import { coverageOf, withCoverage } from "./googleAnalyticsCoverage";
import { fillAfterCollection } from "./googleAnalyticsFillAfter";
import { shiftDay } from "./searchConsoleDays";
import { numberPages } from "./googleAnalyticsPageNumbers";
import { accessTokenFor } from "./googleAnalyticsConnect";
import { startFirstCollection } from "./googleAnalyticsAgentRun";
import { forgetCountedHistory } from "./insightHistoryForget";
import { THRESHOLDED_DIMENSIONS, runFunnelReport, runRealtimeReport, runReport, type FunnelAsk, type QuotaLeft, type RealtimeAsk, type ReportAsk, type ReportRow, type ReportSink, type Report } from "./googleAnalyticsApi";
import type { GoogleFailure } from "./googleApi";
import {
  EVENT_LIST_METRICS,
  EVENT_METRICS,
  EVERY_DEVICE,
  KEPT_BY_DEVICE,
  LIST_DIMENSIONS,
  MAIN_METRICS,
  ITEM_METRICS,
  SHOP_STEPS,
  VISITOR_LISTS,
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
import {
  COUNTED_WITH,
  DAY_FACT_LISTS,
  PAGE_FACT_LISTS,
  analyticsPackedRows,
  dayFactListValidator,
  type DayFactList,
  type AnalyticsList,
  type AnalyticsPeriod,
  type AnalyticsWhich,
} from "./googleAnalyticsSchema";
import { AI_SOURCE_VALUES } from "./utils/aiAssistants";
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

/** The days fetched again each run while Google's figures settle (24 to 48 hours, §2.5): the newest and the two before. */
export const REFETCH_DAYS = 3;

/** Days asked a step: a week. */
export const DAYS_PER_STEP = 7;

/** How long a step works before it hands on: an action stops at ten minutes. */
export const STEP_BUDGET_MS = 4 * 60 * 1000;

/** Waits before asking a busy Google again. */
const BUSY_WAITS_MS = [2_000, 8_000];

/** The weekly periods are asked again once this old. */
const WEEK_MS = 6.5 * 24 * 60 * 60 * 1000;

/** Ready-made parts written a call: each up to 2,000 rows. */
const PARTS_PER_WRITE = 4;

/** Parts of a ready-made list removed a call. */
const PARTS_PER_DELETE = 64;

/** Live lists removed a call. */
const LIVE_PER_DELETE = 200;

/** A day's records of one list: a part or two for each of a handful of devices. */
const DAY_RECORDS_READ = 100;

/** The newest whole day in the property's own time zone (§2.5): yesterday there. */
export function newestWholeDayIn(now: number, timeZone: string): string {
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  } catch {
    today = new Date(now).toISOString().slice(0, 10);
  }
  return shiftDay(today, -1);
}

/**
 * The days a run fetches: every day after the newest held, up to the newest
 * whole day, and the two before the first of them again while they settle —
 * so a day a run missed is caught by the next. With none held yet (or a first
 * collection that stopped part-way), the 60 days kept.
 */
export function analyticsWindow(newestDay: string | undefined, oldestDay: string | undefined, top: string): { from: string; top: string } {
  const oldest = shiftDay(top, -(DAYS_KEPT - 1));
  if (!newestDay || (oldestDay !== undefined && oldestDay > oldest)) return { from: oldest, top };
  const firstNew = shiftDay(newestDay, 1) < top ? shiftDay(newestDay, 1) : top;
  const from = shiftDay(firstNew, -(REFETCH_DAYS - 1));
  return { from: from > oldest ? from : oldest, top };
}

/** A ready-made list's dates: the period ending on the newest day, the span before it, or the same span a year (52 weeks) before. */
export function periodRange(period: AnalyticsPeriod, which: AnalyticsWhich, top: string): { from: string; to: string } {
  const days = Number(period);
  const to = which === "NOW" ? top : which === "BEFORE" ? shiftDay(top, -days) : shiftDay(top, -364);
  return { from: shiftDay(to, -(days - 1)), to };
}

/** A ready-made list's name, as every reader of the lists names it (`googleAnalyticsLists.ts`). */
export { slotKey };

/** A ready-made list to ask: for the main home country, or — `country`, its code — for another home country (§18.6.1). */
export type PeriodJob = { list: AnalyticsList; period: AnalyticsPeriod; which: AnalyticsWhich; country?: string };

/**
 * All pages before landing pages: a landing page finds its address, slash and
 * all, already numbered (`numberPages`). Every event beside them (§18.6.5),
 * the campaigns and the words their links carry, and Visitors' lists (§18.6.6).
 */
const PAGE_LISTS: readonly AnalyticsList[] = [
  "total", "channel", "page", "landing", "event", "campaign", "adKeyword", ...VISITOR_LISTS,
  // Insights' two (insights-analyst-plan.md I35, §8): the channel that first brought each person, and each landing page by channel.
  "firstChannel", "landingChannel",
  // AI assistants' landing pages, whichever channel Google filed them under (ga-channel-pages-plan.md CH13).
  "landingAssistant",
];

/** A shop's own list (§18.6.6): each product, with the span before. */
const SHOP_LISTS: readonly AnalyticsList[] = ["product"];

/**
 * The ready-made lists a run asks for: the 7 and 30 days every run, and the
 * 90 days and 12 months once a week (§4.1). The same span a year before is
 * asked for the long periods (§10, Q2); for the short ones it waits for the
 * "Compare with" choice to be drawn (§4.1). Every chart reads what is kept a
 * day, a week and a month (ga-stored-figures-plan.md SF12), each home
 * country's; the main one's 12 months a day stays a list of its own, every
 * device, for Insights' months and profile changes.
 */
export function dueJobs(
  connection: Pick<Doc<"googleAnalyticsConnections">, "weeklyPeriodsAt" | "shop">,
  now: number,
  others: readonly string[] = [],
): PeriodJob[] {
  const jobs: PeriodJob[] = [];
  const weekly = connection.weeklyPeriodsAt === undefined || now - connection.weeklyPeriodsAt >= WEEK_MS;
  // A shop's products beside the rest (§18.6.6): never asked of a website that sells nothing.
  const lists = connection.shop ? [...PAGE_LISTS, ...SHOP_LISTS] : PAGE_LISTS;
  for (const country of [undefined, ...others]) {
    const of = country ? { country } : {};
    for (const period of ["7", "30"] as const) {
      for (const which of ["NOW", "BEFORE"] as const) for (const list of lists) jobs.push({ list, period, which, ...of });
    }
    if (weekly) {
      for (const period of ["90", "365"] as const) {
        for (const which of ["NOW", "BEFORE", "YEAR"] as const) for (const list of lists) jobs.push({ list, period, which, ...of });
      }
      if (!country) jobs.push({ list: "series", period: "365", which: "NOW" });
    }
  }
  return jobs;
}

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
  newestDay: string | undefined;
  oldestDay: string | undefined;
  /** Each page is held over time (ga-stored-figures-plan.md SF5): the run then adds each new day to it. */
  pagesHeld: boolean;
  weeklyPeriodsAt: number | undefined;
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
  /** A shop (§18.6.6): its products are asked beside the other lists. */
  shop: boolean;
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

export const collectTarget = internalQuery({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  handler: async (ctx, args): Promise<CollectTarget | null> => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    const website = await ctx.db.get(connection.websiteId);
    const addresses = connection.addresses ?? (website ? [website.host] : []);
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
      newestDay: connection.newestDay,
      oldestDay: connection.oldestDay,
      pagesHeld: connection.pageHistoryFrom !== undefined,
      weeklyPeriodsAt: connection.weeklyPeriodsAt,
      country: countryIdOf(hold ? mainConsoleCountry(hold) : "gbr"),
      others: hold && !isTrackedHold(hold) ? await countriesKeptReady(ctx, hold) : [],
      countryHistory: (connection.countryHistory ?? []).map((one) => ({ country: one.country, newestDay: one.newestDay, oldestDay: one.oldestDay, pagesHeld: one.pageHistoryFrom !== undefined })),
      untitled: (await ctx.db.query("googleAnalyticsTitles").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId)).first()) === null,
      shop: connection.shop === true,
      fillsReached: connection.fillsReached ?? [],
      // A shop's first products are asked at once too, as every new list was.
      eventless: (await ctx.db
        .query("googleAnalyticsPeriodSlots")
        .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", slotKey(connection.shop ? "product" : "interest", "365", "NOW", "")))
        .first()) === null
        // Insights' two lists (insights-analyst-plan.md I35, §8) asked at once too, rather than a week later.
        || (await ctx.db
          .query("googleAnalyticsPeriodSlots")
          .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", slotKey("firstChannel", "365", "NOW", "")))
          .first()) === null,
    };
  },
});

/** A step's hold on Google: the token, renewed once when it has just expired. */
export type Session = {
  ctx: ActionCtx;
  connectionId: Id<"googleAnalyticsConnections">;
  accessToken: string;
  requests: number;
  /** Set when renewing the token failed; the problem is already noted on the connection. */
  stopped: string | null;
  /** What is left of the website's allowances, as Google counted them on its last answer (SF18); null before one. */
  quota: QuotaLeft | null;
};

// Each run's budget for the hour, and Google's refusals that refresh within it (ga-stored-figures-plan.md SF17, SF20).
export { HOURLY_REFUSAL, KEPT_BACK, overBudget } from "./googleAnalyticsBudget";
import { HOURLY_REFUSAL, overBudget, quotaStillSeen } from "./googleAnalyticsBudget";

/** A session's start: its sign-in, and what Google last said is left while it holds (`googleAnalyticsQuota.ts`). */
export async function openSession(
  ctx: ActionCtx,
  connectionId: Id<"googleAnalyticsConnections">,
): Promise<{ ok: true; session: Session } | { ok: false; problem: string }> {
  const token = await accessTokenFor(ctx, connectionId);
  if (!token.ok) return { ok: false, problem: token.problem };
  const seen = await ctx.runQuery(internal.googleAnalyticsQuota.quotaSeenOf, { connectionId });
  return { ok: true, session: { ctx, connectionId, accessToken: token.accessToken, requests: 0, stopped: null, quota: quotaStillSeen(seen, Date.now()) } };
}

/**
 * One report, renewing the token once if it has just expired and waiting a
 * little when Google is busy — and not asked at all once the run's budget
 * for the hour is spent (SF17).
 */
export async function ask(session: Session, property: string, report: ReportAsk, sink?: ReportSink): Promise<({ ok: true } & Report) | GoogleFailure> {
  // Asked again after a failure part-way: with a sink, from the page Google reached (ga-big-site-reliability-plan.md BR2).
  let fromPage = 0;
  return await retried(session, async (token) => {
    const answer = await runReport(token, property, report, sink, fromPage);
    if (!answer.ok) fromPage = answer.pagesRead;
    if (answer.ok && answer.quota) session.quota = answer.quota;
    if (answer.ok && answer.quota) await session.ctx.runMutation(internal.googleAnalyticsQuota.noteQuota, { connectionId: session.connectionId, quota: answer.quota });
    return { answer, requests: answer.ok ? answer.requests : 1 };
  }, { budgeted: true, thresholded: report.dimensions.some((dimension) => THRESHOLDED_DIMENSIONS.has(dimension)) });
}

/** Google's live figures (§18.6.7), asked as every report is; nothing is kept. */
export async function askRealtime(session: Session, property: string, live: RealtimeAsk): Promise<{ ok: true; rows: ReportRow[] } | GoogleFailure> {
  return await retried(session, async (token) => ({ answer: await runRealtimeReport(token, property, live), requests: 1 }));
}

/**
 * Who did an event and then one of others (§18.6.5), asked as every report is: its sign-in renewed, Google waited for
 * when busy. A collection's funnel (`budgeted`, ga-conversions-visitors-plan.md CV4) keeps to the run's budget; one
 * asked from an event's screen does not: what is kept back is for it (SF17).
 */
export async function askFunnel(session: Session, property: string, funnel: FunnelAsk, budgeted = false): Promise<{ ok: true; did: number; then: number } | GoogleFailure> {
  return await retried(session, async (token) => ({ answer: await runFunnelReport(token, property, funnel), requests: 1 }), { budgeted });
}

/**
 * One ask of Google, its sign-in renewed once when it ran out and asked again
 * a little later when Google was busy. A collection's ask (`budgeted`) is not
 * made once its budget for the hour is spent (`BUDGET`); a refusal for an
 * allowance that refreshes within the hour is not asked again a few seconds
 * later — the run waits for the hour (SF20).
 */
async function retried<Answer extends { ok: true } | GoogleFailure>(
  session: Session,
  call: (accessToken: string) => Promise<{ answer: Answer; requests: number }>,
  budget: { budgeted: boolean; thresholded?: boolean } = { budgeted: false },
): Promise<Answer> {
  let renewed = false;
  for (let wait = 0; ;) {
    const spent = budget.budgeted ? overBudget(session.quota, budget.thresholded === true) : null;
    if (spent) return { ok: false, reason: "BUDGET", status: 0, detail: spent } as Answer;
    const { answer, requests } = await call(session.accessToken);
    session.requests += requests;
    if (answer.ok) return answer;
    if (answer.reason === "EXPIRED" && !renewed) {
      renewed = true;
      const token = await accessTokenFor(session.ctx, session.connectionId, true);
      if (!token.ok) {
        session.stopped = token.problem;
        return answer;
      }
      session.accessToken = token.accessToken;
      continue;
    }
    if ((answer.reason === "BUSY" || answer.reason === "UNREACHABLE") && wait < BUSY_WAITS_MS.length && !HOURLY_REFUSAL.test(answer.detail)) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAITS_MS[wait]));
      wait += 1;
      continue;
    }
    return answer;
  }
}

export type Asked = { ok: true; groups: Map<string, ListRow[]>; flags: { folded: boolean; thresholded: boolean; cut: boolean } } | GoogleFailure;

/**
 * A list's two asks — its figures and its key events — joined (`joinAsks`):
 * for one device, or one landing page, when a screen asks live (GA20, GA22).
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
  also: { converting?: boolean; trim?: (rows: ListRow[]) => ListRow[] } = {},
): Promise<Asked> {
  const dimensions = [...lead, ...LIST_DIMENSIONS[list]];
  const base = {
    startDate: range.from,
    endDate: range.to,
    hostNames: target.addresses,
    countries: [target.country],
    ...(only.device ? { device: only.device } : {}),
    ...(only.landingPage !== undefined ? { only: { dimension: "landingPage", values: only.landingPage } }
      : only.pagePath !== undefined ? { only: { dimension: "pagePath", values: only.pagePath } }
        // Only the assistants' visits: a list of every source by every landing page would be a website's longest.
        : list === "landingAssistant" ? { only: { dimension: "sessionSource", values: [...AI_SOURCE_VALUES] } } : {}),
  };
  const metrics = isEventList(list) ? EVENT_LIST_METRICS : isItemList(list) ? ITEM_METRICS : MAIN_METRICS;
  // Each answer joined as it arrives, and a page list trimmed while it is read (BR2, BR3).
  const joined = listJoiner(list, lead, new Set(target.perVisit));
  const due = trimDue();
  const trimmed = (add: (rows: ReportRow[]) => void) => (rows: ReportRow[]) => {
    add(rows);
    if (also.trim && due.now(joined.size())) {
      joined.trim(also.trim);
      due.after(joined.size());
    }
  };
  const main = await ask(session, target.property!, { ...base, dimensions, metrics: [...metrics] }, trimmed((rows) => joined.addMain(rows)));
  if (!main.ok) return main;
  let events: ({ ok: true } & Report) | null = null;
  // An event list counts every event itself, and a product list cannot be split by event: no key events to join (§18.6.5, §18.6.6).
  if (target.events.length > 0 && !isEventList(list) && !isItemList(list)) {
    const answer = await ask(session, target.property!, {
      ...base,
      dimensions: [...dimensions, "eventName"],
      metrics: [...EVENT_METRICS],
      eventNames: target.events,
    }, trimmed((rows) => joined.addEvents(rows)));
    if (!answer.ok) return answer;
    events = answer;
  }
  if (also.converting && target.events.length > 0) {
    const answer = await ask(session, target.property!, { ...base, dimensions, metrics: ["sessions"], eventNames: target.events }, trimmed((rows) => joined.addConverting(rows)));
    if (!answer.ok) return answer;
  }
  if (also.trim) joined.trim(also.trim);
  return {
    ok: true,
    groups: joined.groups(),
    flags: {
      folded: main.folded || (events?.folded ?? false),
      thresholded: main.thresholded || (events?.thresholded ?? false),
      cut: main.cut || (events?.cut ?? false),
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
export type StepResult = { ok: true; rows: number; requests: number } | { ok: false; reason: string; access: boolean; busy: boolean; wait: boolean; requests: number };

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
  const answers: Array<[DayFactList, Extract<Asked, { ok: true }>]> = [];
  for (const list of lists) {
    const asked = await askList(session, asking, list, ["date", "deviceCategory"], range);
    if (!asked.ok) return failed(session, asked);
    answers.push([list, asked]);
  }
  let rows = 0;
  const days: string[] = [];
  for (let day = range.to; day >= range.from; day = shiftDay(day, -1)) days.push(day);
  for (const day of days) {
    const records: { list: DayFactList; device: string; parts: PackedPart[]; folded: boolean; thresholded: boolean; cut: boolean }[] = [];
    for (const [list, asked] of answers) {
      const devices = new Map<string, ListRow[]>();
      for (const [group, groupRows] of asked.groups) {
        const [groupDay, device] = groupKeys(group);
        if (groupDay === day) devices.set(device, groupRows);
      }
      if (!devices.has(EVERY_DEVICE)) devices.set(EVERY_DEVICE, []);
      for (const [device, groupRows] of devices) {
        rows += groupRows.length;
        records.push({ list, device: dayDevice(device, country), parts: packList(list, groupRows, target.events), ...asked.flags });
      }
    }
    await ctx.runMutation(internal.googleAnalyticsCollect.writeDay, {
      connectionId,
      property: target.property!,
      day,
      records,
      fetchedAt: Date.now(),
      ...(country ? { country } : {}),
    });
  }
  return { ok: true, rows, requests: session.requests };
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
      // Only this home country's records: each country's sit beside the others' (`dayDevice`).
      const held = (await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", hold).eq("list", list).eq("day", args.day))
        .take(DAY_RECORDS_READ))
        .filter((row) => countryOfDayDevice(row.device) === country);
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
    const out: Record<string, { slot: number; hash: string; from: string; to: string }> = {};
    for (const key of args.keys) {
      const slot = await ctx.db
        .query("googleAnalyticsPeriodSlots")
        .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("key", key))
        .first();
      if (slot) out[key] = { slot: slot.slot, hash: slot.hash, from: slot.from, to: slot.to };
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
    // This build's parts past its own count, and the whole of the build it replaces.
    const stale = [
      ...await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key).eq("slot", args.slot).gte("part", args.parts))
        .take(PARTS_PER_DELETE),
      ...await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key).eq("slot", 1 - args.slot))
        .take(PARTS_PER_DELETE),
    ];
    for (const part of stale) await ctx.db.delete(part._id);
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
): Promise<StepResult> {
  const range = periodRange(job.period, job.which, top);
  const lead = KEPT_BY_DEVICE[job.list] ? (["deviceCategory"] as const) : ([] as const);
  const country = job.country ?? "";
  const asking = country ? { ...target, country: countryIdOf(country) } : target;
  // All pages count their reading too — a page's views and scrolls — for its story and its group's (SF13).
  const reading = job.list === "page" ? { ...asking, events: [...asking.events, ...READ_EVENTS] } : asking;
  // Landing pages by channel for the dates now also count the visits that made any listed event: Conversions' flow (CV8).
  const also = { converting: job.list === "landingChannel" && job.which === "NOW" };
  const asked = await askList(session, reading, job.list, lead, range, {}, also);
  if (!asked.ok) return failed(session, asked);
  const devices = new Map<string, ListRow[]>();
  for (const [group, rows] of asked.groups) devices.set(lead.length > 0 ? groupKeys(group)[0] : EVERY_DEVICE, rows);
  // A shop is one with any of its four steps in the last 90 days (§18.6.6): noted each time those events are read.
  if (job.list === "event" && job.period === "90" && job.which === "NOW" && !job.country) {
    const shop = [...asked.groups.values()].flat().some((row) => (SHOP_STEPS as readonly string[]).includes(row.key) && (row.times ?? 0) > 0);
    if (shop !== target.shop) await ctx.runMutation(internal.googleAnalyticsCollect.noteShop, { connectionId, property: target.property!, shop });
  }
  // People cannot be added up across devices (§18.6.2): every device is asked whole, as the website's totals always
  // were — the channels aside, whose people no screen shows for every device.
  if (lead.length > 0 && job.list !== "channel") {
    const whole = await askList(session, reading, job.list, [], range, {}, also);
    if (!whole.ok) return failed(session, whole);
    devices.set(EVERY_DEVICE, [...whole.groups.values()].flat());
  }
  if (!devices.has(EVERY_DEVICE)) devices.set(EVERY_DEVICE, []);
  const keys = [...devices.keys()].map((device) => slotKey(job.list, job.period, job.which, device, country));
  const slots: Record<string, { slot: number; hash: string; from: string; to: string }> =
    await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, { companyWebsiteId: target.companyWebsiteId, keys });
  let rows = 0;
  for (const [device, deviceRows] of devices) {
    const listRows = job.list === "landing" || job.list === "page" || job.list === "landingChannel" || job.list === "landingAssistant"
      ? await numberPages(ctx, target, deviceRows, job.list)
      : deviceRows;
    rows += listRows.length;
    const key = slotKey(job.list, job.period, job.which, device, country);
    if (!(await writeList(ctx, connectionId, target, job.list, key, listRows, range, asked.flags, slots[key], reading.events))) return { ok: true, rows, requests: session.requests };
  }
  return { ok: true, rows, requests: session.requests };
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
  rows: readonly ListRow[],
  range: { from: string; to: string },
  flags: { folded: boolean; thresholded: boolean; cut: boolean },
  held: { slot: number; hash: string; from: string; to: string } | undefined,
  /** The events given columns: the key events unless the list asked others. */
  events: readonly string[] = target.events,
): Promise<boolean> {
  const parts = packList(list, rows, events);
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
    await ctx.db.patch(connection._id, { shop: args.shop || undefined, updatedAt: Date.now() });
    return null;
  },
});

/** The run's last word on the connection: when it was collected, and the weekly lists when they were asked. */
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
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    const now = Date.now();
    const first = args.firstDone && connection.backfilledAt === undefined;
    // Insights' months counted the old way are asked again on its next run (BT6).
    if (args.recount) await forgetCountedHistory(ctx, connection.companyWebsiteId);
    await ctx.db.patch(connection._id, {
      ...(args.hostVisits ? { hostVisits: args.hostVisits } : {}),
      ...(args.recount ? { countedWith: COUNTED_WITH } : {}),
      lastCollectedAt: now,
      dailyPeriodsAt: now,
      ...(args.weekly ? { weeklyPeriodsAt: now } : {}),
      ...(args.firstDone && connection.backfilledAt === undefined ? { backfilledAt: now } : {}),
      collecting: undefined,
      // A whole run asked every list: the next starts from the first again.
      listsFrom: undefined,
      problem: undefined,
      problemAt: undefined,
      problemDetail: undefined,
      updatedAt: now,
    });
    // The past rolled on (ga-stored-figures-plan.md SF2): days past 90 into weeks, weeks past a year into months;
    // each week, the pages quiet for two years cleared (SF5).
    if (connection.newestDay) await ctx.scheduler.runAfter(0, internal.googleAnalyticsHistory.rollHistory, { companyWebsiteId: connection.companyWebsiteId, newest: connection.newestDay });
    if (connection.newestDay && args.weekly) await ctx.scheduler.runAfter(0, internal.googleAnalyticsPageSeries.dropOldPageSeries, { companyWebsiteId: connection.companyWebsiteId, newest: connection.newestDay });
    // What screens asked of Google live is held until now (GA23): the ready-made lists are fresher.
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropLive, { companyWebsiteId: connection.companyWebsiteId });
    // Tracking health when the first collection is in, and every week (GA11).
    if (first || args.weekly) await ctx.scheduler.runAfter(0, internal.googleAnalyticsHealth.runHealthChecks, { connectionId: connection._id });
    // Each page's visits sit beside Search Console's clicks in the website's page list (§4.6): it is rebuilt, as
    // Search Console's settle asks, and writes only the pages whose figures moved.
    await ctx.scheduler.runAfter(0, internal.holdPages.requestRebuild, { holdId: connection.companyWebsiteId });
    // A home country taken off the website's list goes (§18.6.1).
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountriesNotKept, { companyWebsiteId: connection.companyWebsiteId });
    if (args.nightFrom !== undefined) await fillAfterCollection(ctx, connection, args.nightFrom);
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
        clearing: undefined, newestDay: undefined, oldestDay: undefined, backfilledAt: undefined, historyFrom: undefined, historyFilled: undefined, pageHistoryFrom: undefined, countryHistory: undefined, listsFrom: undefined, quotaSeen: undefined, fillsReached: undefined,
        dailyPeriodsAt: undefined, weeklyPeriodsAt: undefined, updatedAt: Date.now(),
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
