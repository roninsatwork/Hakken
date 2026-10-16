/**
 * A pretend Google for the collection's rehearsal (collection-reliability-plan.md,
 * RR5): a website ten times kordatackle.com's size, answered as Google's Data
 * API and Search Console answer, made up as each ask comes in — so a whole
 * collection runs on the real backend, inside Convex's real limits, and asks
 * Google nothing. No database here, and nothing held between asks: each
 * answer is worked out from the ask alone, the same every time.
 *
 * Only a rehearsal's own sign-in reaches it: its access token starts with
 * `REHEARSAL_TOKEN`, which no Google sign-in can give (Google's start
 * `ya29.`), and only the rehearsal's setup writes one (`collectionRehearsal.ts`).
 */

export const REHEARSAL_TOKEN = "hakken-rehearsal:";

export function isRehearsalToken(accessToken: string): boolean {
  return accessToken.startsWith(REHEARSAL_TOKEN);
}

/** How big the pretend website is. The rehearsal's own: ten times kordatackle.com (about 1,400 pages). */
export type RehearsalSize = {
  /** Pages Google Analytics sees visited, and Search Console shows. */
  pages: number;
  /** Search Console's searches by page, a day, for web results. */
  consoleRowsADay: number;
  /** The most values of a split that is not a day, week, month, device or page — channels, sources, events — or 0 for all of them. A small rehearsal's is small. */
  breadth: number;
  /** Days of history the website has, to today: nothing is answered for days before them. */
  days: number;
};

export const TEN_TIMES_KORDA: RehearsalSize = { pages: 14_000, consoleRowsADay: 100_000, breadth: 0, days: 800 };

/** The size is carried in the token itself: `hakken-rehearsal:<pages>:<rows a day>:<breadth>:<days>`. */
export function rehearsalToken(size: RehearsalSize): string {
  return `${REHEARSAL_TOKEN}${size.pages}:${size.consoleRowsADay}:${size.breadth}:${size.days}`;
}

function sizeOf(accessToken: string): RehearsalSize {
  const [pages, rows, breadth, days] = accessToken.slice(REHEARSAL_TOKEN.length).split(":").map(Number);
  return {
    pages: pages > 0 ? pages : TEN_TIMES_KORDA.pages,
    consoleRowsADay: rows > 0 ? rows : TEN_TIMES_KORDA.consoleRowsADay,
    breadth: breadth > 0 ? breadth : 0,
    days: days > 0 ? days : TEN_TIMES_KORDA.days,
  };
}

export const REHEARSAL_HOST = "rehearsal.hakken.test";

/** A whole number from a few others, spread evenly: the same numbers give the same answer. */
function mix(...values: number[]): number {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const isoDay = (number: number) => new Date(number * DAY_MS).toISOString().slice(0, 10);

function daysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = dayNumber(from); day <= dayNumber(to); day += 1) out.push(isoDay(day));
  return out;
}

/** The days of a span the website has history for: none before its first day. */
function heldDays(from: string, to: string, size: RehearsalSize): string[] {
  const first = isoDay(Math.floor(Date.now() / DAY_MS) - size.days);
  return daysIn(from > first ? from : first, to);
}

function isoWeekCode(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = 1 + Math.floor((thursday.getTime() - yearStart) / (7 * DAY_MS));
  return `${thursday.getUTCFullYear()}${String(week).padStart(2, "0")}`;
}

const unique = (values: string[]) => [...new Set(values)];

const pagePath = (page: number) => `/${["shop", "guides", "help", "news", "products", "services"][page % 6]}/item-${page}/`;

/** Each dimension's values over a span: what Google would split by. A dimension not named here has ten. */
function valuesOf(dimension: string, from: string, to: string, size: RehearsalSize): string[] {
  const days = heldDays(from, to, size);
  switch (dimension) {
    case "date": return days.map((day) => day.replaceAll("-", ""));
    case "isoYearIsoWeek": return unique(days.map(isoWeekCode));
    case "yearMonth": return unique(days.map((day) => day.slice(0, 7).replace("-", "")));
    case "deviceCategory": return ["desktop", "mobile", "tablet", "smart tv"];
    case "landingPage":
    case "pagePath": return Array.from({ length: size.pages }, (_, page) => pagePath(page));
    case "pageReferrer": return Array.from({ length: size.pages }, (_, page) => `https://www.${REHEARSAL_HOST}${pagePath(page)}`);
    case "hostName": return [`www.${REHEARSAL_HOST}`, REHEARSAL_HOST];
    case "sessionDefaultChannelGroup":
    case "firstUserDefaultChannelGroup": return ["Organic Search", "Direct", "Referral", "Paid Search", "Organic Social", "Email", "Unassigned", "Display"];
    case "sessionSource":
    case "firstUserSource": return Array.from({ length: 40 }, (_, at) => (at === 0 ? "google" : at === 1 ? "(direct)" : `source-${at}.test`));
    case "sessionMedium": return ["organic", "(none)", "referral", "cpc", "email", "social"];
    case "sessionCampaignName": return Array.from({ length: 15 }, (_, at) => (at === 0 ? "(not set)" : `campaign-${at}`));
    case "sessionManualTerm": return Array.from({ length: 100 }, (_, at) => (at === 0 ? "(not set)" : `term ${at}`));
    case "eventName": return ["page_view", "session_start", "first_visit", "user_engagement", "scroll", "click", "generate_lead", "form_submit", "click_tel", "file_download", "view_search_results", "video_start", "video_complete", "sign_up", "begin_checkout", "add_to_cart"];
    case "newVsReturning": return ["new", "returning"];
    case "browser": return ["Chrome", "Safari", "Edge", "Firefox", "Samsung Internet", "Opera", "Android Webview", "(not set)"];
    case "operatingSystem": return ["Windows", "iOS", "Android", "Macintosh", "Linux", "Chrome OS", "(not set)"];
    case "userAgeBracket": return ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"];
    case "userGender": return ["male", "female", "unknown"];
    case "brandingInterest": return Array.from({ length: 25 }, (_, at) => `Interest ${at}`);
    case "countryId": return ["GB", "IE", "US", "FR", "DE", "ES", "NL", "AU", "CA", "IN"];
    case "country": return ["United Kingdom", "Ireland", "United States", "France", "Germany", "Spain", "Netherlands", "Australia", "Canada", "India"];
    case "city": return Array.from({ length: 30 }, (_, at) => `City ${at}`);
    case "pageTitle": return Array.from({ length: size.pages }, (_, page) => `Item ${page}`);
    case "linkUrl": return Array.from({ length: 50 }, (_, at) => `https://partner-${at}.test/`);
    case "itemName":
    case "itemCategory": return [];
    default: return Array.from({ length: 10 }, (_, at) => `${dimension}-${at}`);
  }
}

const PAGE_LIKE = new Set(["landingPage", "pagePath", "pageReferrer", "pageTitle"]);
const TIME_LIKE = new Set(["date", "isoYearIsoWeek", "yearMonth"]);

/**
 * How many of a dimension's values go with each value of the dimensions before
 * it, as on a real website: not every page is visited every day, nor from
 * every other page, nor by every channel and source.
 * - A page on a day: a quarter of the pages; in a week half; in a month most.
 * - A page split by another page: twenty. Anything else split after a page: three.
 * - A source within a channel, a medium within a source: five, two.
 * - A small rehearsal's `breadth`: at most that many of any split but days, devices and pages.
 */
function spread(dimension: string, before: readonly string[], count: number, size: RehearsalSize): number {
  let most = count;
  if (PAGE_LIKE.has(dimension)) {
    if (before.some((name) => PAGE_LIKE.has(name))) most = 20;
    else if (before.includes("date")) most = Math.ceil(count / 4);
    else if (before.includes("isoYearIsoWeek")) most = Math.ceil(count / 2);
    else if (before.includes("yearMonth")) most = Math.ceil((count * 4) / 5);
  } else if (!TIME_LIKE.has(dimension) && dimension !== "deviceCategory") {
    if (before.some((name) => PAGE_LIKE.has(name))) most = 3;
    else if (dimension === "sessionSource" || dimension === "firstUserSource") most = before.some((name) => /ChannelGroup|CampaignName/.test(name)) ? 5 : count;
    else if (dimension === "sessionMedium") most = before.includes("sessionSource") ? 2 : count;
    if (size.breadth > 0) most = Math.min(most, size.breadth);
  }
  return Math.min(count, most);
}

type Filter = { filter?: { fieldName: string; inListFilter?: { values: string[] }; stringFilter?: { value: string } }; andGroup?: { expressions: Filter[] } };

/** The values a filter keeps, by dimension: an ask for one page, a few events, a home country. */
function kept(filter: Filter | undefined, into = new Map<string, Set<string>>()): Map<string, Set<string>> {
  if (!filter) return into;
  if (filter.andGroup) {
    for (const one of filter.andGroup.expressions) kept(one, into);
    return into;
  }
  const field = filter.filter;
  if (field) into.set(field.fieldName, new Set((field.inListFilter?.values ?? [field.stringFilter?.value ?? ""]).map((value) => value.toLowerCase())));
  return into;
}

type ReportAsk = {
  dateRanges?: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
  dimensionFilter?: Filter;
  limit?: number;
  offset?: number;
};

/** A metric's value for one row: visits fall away down the list, as on a real website. */
function metricValue(metric: string, row: number, salt: number): string {
  const visits = 1 + Math.floor(4_000 / (1 + row)) + (mix(row, salt) % 7);
  switch (metric) {
    case "sessions":
    case "totalUsers": return String(visits);
    case "engagedSessions": return String(Math.floor(visits * 0.6));
    case "newUsers": return String(Math.floor(visits * 0.7));
    case "userEngagementDuration": return String(visits * 41);
    case "screenPageViews": return String(visits * 2);
    case "eventCount": return String(visits * 3);
    case "keyEvents": return String(Math.floor(visits / 25));
    case "ecommercePurchases":
    case "purchaseRevenue":
    case "itemsViewed":
    case "itemsAddedToCart":
    case "itemsPurchased":
    case "itemRevenue": return "0";
    default: return String(visits % 11);
  }
}

/** Google Analytics' Data API answer to a report: one page of it, as `limit` and `offset` ask. */
function report(ask: ReportAsk, size: RehearsalSize): unknown {
  const range = ask.dateRanges?.[0] ?? { startDate: "2026-01-01", endDate: "2026-01-01" };
  const dimensions = (ask.dimensions ?? []).map((one) => one.name);
  const metrics = (ask.metrics ?? []).map((one) => one.name);
  const filters = kept(ask.dimensionFilter);
  // Each dimension's values, as many as go with those before it, a filter keeping its own.
  const columns = dimensions.map((dimension, at) => {
    const all = valuesOf(dimension, range.startDate, range.endDate, size);
    const only = filters.get(dimension);
    const values = only ? all.filter((value) => only.has(value.toLowerCase())) : all;
    return values.slice(0, spread(dimension, dimensions.slice(0, at), values.length, size));
  });
  // A filtered answer's row by its place among all the website's values, whatever the filter: it has the same figures
  // however it is filtered, as at Google, so a big website's lists asked a group of pages at a time add up to the same
  // as one ask of every page (2026-10-16). An answer filtered by nothing keeps its rows' order as their place.
  const everyValue = dimensions.map((dimension) => new Map(valuesOf(dimension, range.startDate, range.endDate, size).map((value, place) => [value, place])));
  const placeOf = (values: ReadonlyArray<{ value: string }>) => {
    let place = 0;
    for (let at = 0; at < values.length; at += 1) place = place * everyValue[at].size + (everyValue[at].get(values[at].value) ?? 0);
    return place;
  };
  // Nothing before the website's first day, whatever the split.
  const total = heldDays(range.startDate, range.endDate, size).length === 0 ? 0 : columns.reduce((product, values) => product * values.length, 1);
  const offset = ask.offset ?? 0;
  const limit = ask.limit ?? 10_000;
  const salt = mix(dimensions.length, metrics.length, dayNumber(range.startDate));
  const rows: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> = [];
  for (let row = offset; row < Math.min(total, offset + limit); row += 1) {
    let rest = row;
    const values: Array<{ value: string }> = new Array(columns.length);
    for (let at = columns.length - 1; at >= 0; at -= 1) {
      values[at] = { value: columns[at][rest % columns[at].length] };
      rest = Math.floor(rest / columns[at].length);
    }
    const place = filters.size > 0 ? placeOf(values) : row;
    rows.push({ dimensionValues: values, metricValues: metrics.map((metric) => ({ value: metricValue(metric, place, salt) })) });
  }
  const plenty = { consumed: 1, remaining: 1_000_000 };
  return {
    rows,
    rowCount: total,
    metadata: {},
    // What is left of the allowances, as Google says with every answer, noted by the run each time: plenty, so
    // the rehearsal never waits for an hour. A small rehearsal's answers leave it out, as a test's fake Google does.
    ...(size.breadth === 0 ? { propertyQuota: { tokensPerDay: plenty, tokensPerHour: plenty, tokensPerProjectPerHour: plenty, potentiallyThresholdedRequestsPerHour: plenty, concurrentRequests: plenty } } : {}),
  };
}

type SearchAsk = {
  startDate: string;
  endDate: string;
  type?: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
};

/** Search Console's searches: a few words and a number, about kordatackle.com's length. */
const WORDS = ["fishing", "tackle", "rod", "reel", "carp", "bait", "line", "hooks", "float", "lure", "sea", "pike", "boat", "net", "box", "bag"];
const searchOf = (at: number) => `${WORDS[at % 16]} ${WORDS[(at >> 4) % 16]} ${WORDS[(at >> 8) % 16]} ${at}`;

/** Search Console's Search Analytics answer: one page of it, as `rowLimit` and `startRow` ask. */
function searchAnalytics(ask: SearchAsk, size: RehearsalSize): unknown {
  const dimensions = ask.dimensions ?? [];
  const days = heldDays(ask.startDate, ask.endDate, size);
  if (days.length === 0) return {};
  // Web results have the most; images a tenth; the rest little or nothing, as on a tackle shop's website.
  const share = ask.type === undefined || ask.type === "web" ? 1 : ask.type === "image" ? 0.1 : ask.type === "video" ? 0.01 : 0;
  if (share === 0) return {};
  const pairs = Math.max(1, Math.floor(size.consoleRowsADay * share));
  // Over many days more searches are seen than on one: a day's, and a fifth more for each further week.
  const seen = Math.floor(pairs * (1 + Math.min(days.length - 1, 365) / 35));
  const totalOf = (dimension: string): number => {
    switch (dimension) {
      case "date": return days.length;
      case "query": return Math.floor(seen * 0.6);
      case "page": return Math.min(size.pages, Math.floor(seen / 4) + 1);
      case "country": return 60;
      case "device": return 3;
      case "searchAppearance": return 4;
      default: return 10;
    }
  };
  const total = dimensions.length === 0 ? 1
    : dimensions.length === 2 && dimensions.includes("query") && dimensions.includes("page") ? seen
      : dimensions.reduce((product, dimension) => product * totalOf(dimension), 1);
  const start = ask.startRow ?? 0;
  const limit = ask.rowLimit ?? 1_000;
  const keyOf = (dimension: string, at: number): string => {
    switch (dimension) {
      case "date": return days[at % days.length];
      case "query": return searchOf(at);
      case "page": return `https://www.${REHEARSAL_HOST}${pagePath(at % size.pages)}`;
      case "country": return ["gbr", "irl", "usa", "fra", "deu", "esp", "nld", "aus", "can", "ind"][at % 10] + (at >= 10 ? String(at) : "");
      case "device": return ["MOBILE", "DESKTOP", "TABLET"][at % 3];
      case "searchAppearance": return ["REVIEW_SNIPPET", "VIDEO", "PRODUCT_SNIPPET", "MERCHANT_LISTINGS"][at % 4];
      default: return `${dimension}-${at}`;
    }
  };
  const rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = [];
  for (let row = start; row < Math.min(total, start + limit); row += 1) {
    const keys = dimensions.length === 2 && dimensions.includes("query") && dimensions.includes("page")
      // A search's page: most searches lead to one page, a few to two or three.
      ? dimensions.map((dimension) => (dimension === "query" ? searchOf(Math.floor(row * 0.6)) : keyOf("page", mix(row) % size.pages)))
      : dimensions.map((dimension, at) => keyOf(dimension, Math.floor(row / dimensions.slice(at + 1).reduce((product, after) => product * totalOf(after), 1))));
    const impressions = 1 + Math.floor(20_000 / (1 + row)) + (mix(row, days.length) % 13);
    const clicks = Math.floor(impressions * (mix(row) % 9) / 100);
    rows.push({ keys, clicks, impressions, ctr: clicks / impressions, position: 1 + (mix(row, 7) % 400) / 10 });
  }
  return rows.length > 0 ? { rows, responseAggregationType: "byPage" } : {};
}

/**
 * The pretend Google's answer to one call, as `callGoogle` hands it back.
 * A call it does not know is refused, saying which, so a rehearsal that
 * reaches one stops and says so rather than going on wrong.
 */
export function rehearsalAnswer(url: string, accessToken: string, body: unknown): { ok: true; json: unknown } | { ok: false; reason: "REFUSED"; status: number; detail: string } {
  const size = sizeOf(accessToken);
  if (/analyticsdata\.googleapis\.com\/v1beta\/properties\/[^/:]+:runReport$/.test(url)) return { ok: true, json: report((body ?? {}) as ReportAsk, size) };
  if (/searchconsole\.googleapis\.com\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(url)) return { ok: true, json: searchAnalytics(body as SearchAsk, size) };
  if (/searchconsole\.googleapis\.com\/webmasters\/v3\/sites$/.test(url)) {
    return { ok: true, json: { siteEntry: [{ siteUrl: `sc-domain:${REHEARSAL_HOST}`, permissionLevel: "siteOwner" }] } };
  }
  return { ok: false, reason: "REFUSED", status: 404, detail: `The rehearsal's pretend Google has no answer for ${url}.` };
}
