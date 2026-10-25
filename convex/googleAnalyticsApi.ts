import { callGoogle, type GoogleFailure } from "./googleApi";

/**
 * Google Analytics' two APIs, as Hakken calls them
 * (docs/plans/active/google-analytics-plan.md §2): the Admin API for what an
 * account can see — its properties, their web streams and key events, each
 * property's time zone and currency — and the Data API's `runReport` for the
 * figures. No database here: `googleAnalyticsConnect.ts` and the collection
 * decide what an answer means. Free to call, inside Google's quotas (§2.5).
 */

export const GOOGLE_ANALYTICS_READ_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

/**
 * Properties whose web streams are read to find the website's: an agency's
 * account can see hundreds, and each is one ask. Past this, the rest are
 * listed without knowing whether they record the website.
 */
export const MOST_PROPERTIES_CHECKED = 100;

/** Asks sent to Google at once while checking properties: well inside its ten at once (§2.5). */
const AT_ONCE = 5;

/** A host as `websites.host` stores it: lowercase, no `www.`, no port. */
export function bareHost(host: string): string | null {
  try {
    return new URL(`http://${host.trim()}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The Admin API
// ---------------------------------------------------------------------------

export type AnalyticsProperty = {
  /** Google's name for it, `properties/312456789`. */
  property: string;
  displayName: string;
  /** The Analytics account it sits in, as the account names it. */
  accountName: string;
};

/** Every Google Analytics property the signed-in account can see. */
export async function listAnalyticsProperties(accessToken: string): Promise<{ ok: true; properties: AnalyticsProperty[] } | GoogleFailure> {
  const properties: AnalyticsProperty[] = [];
  let pageToken = "";
  // Two hundred a page; an account seeing more than ten pages' worth is read no further.
  for (let page = 0; page < 10; page += 1) {
    const answer = await callGoogle(
      `${ADMIN}/accountSummaries?${new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) })}`,
      accessToken,
    );
    if (!answer.ok) return answer;
    const json = answer.json as {
      accountSummaries?: { displayName?: string; propertySummaries?: { property?: string; displayName?: string; propertyType?: string }[] }[];
      nextPageToken?: string;
    };
    for (const account of json.accountSummaries ?? []) {
      for (const summary of account.propertySummaries ?? []) {
        // Roll-up and sub-properties hold no website of their own.
        if (!summary.property || (summary.propertyType && summary.propertyType !== "PROPERTY_TYPE_ORDINARY")) continue;
        properties.push({
          property: summary.property,
          displayName: summary.displayName ?? summary.property,
          accountName: account.displayName ?? "",
        });
      }
    }
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return { ok: true, properties };
}

/** A property's web streams' addresses (`https://www.example.co.uk`). */
export async function webStreamAddresses(accessToken: string, property: string): Promise<{ ok: true; addresses: string[] } | GoogleFailure> {
  const answer = await callGoogle(`${ADMIN}/${property}/dataStreams?pageSize=50`, accessToken);
  if (!answer.ok) return answer;
  const streams = (answer.json as { dataStreams?: { type?: string; webStreamData?: { defaultUri?: string } }[] }).dataStreams ?? [];
  return {
    ok: true,
    addresses: streams.flatMap((stream) => stream.type === "WEB_DATA_STREAM" && stream.webStreamData?.defaultUri ? [stream.webStreamData.defaultUri] : []),
  };
}

/** Whether an address a web stream records is this website (`www.` or not). */
export function streamIsSite(address: string, siteHost: string): boolean {
  const site = bareHost(siteHost);
  let host: string;
  try {
    host = new URL(address.includes("://") ? address : `https://${address}`).hostname;
  } catch {
    return false;
  }
  return site !== null && bareHost(host) === site;
}

export type PropertyChoice = AnalyticsProperty & {
  /** Its web stream for this website, when it has one. */
  stream: string | null;
  /** False for a property past `MOST_PROPERTIES_CHECKED`, whose streams were not read. */
  checked: boolean;
};

/**
 * The account's properties for the choice (§3, step 3), the ones with a web
 * stream for this website first. A property Google would not show the streams
 * of is listed as not this website's.
 */
export async function propertiesForSite(
  accessToken: string,
  siteHost: string,
): Promise<{ ok: true; choices: PropertyChoice[] } | GoogleFailure> {
  const listed = await listAnalyticsProperties(accessToken);
  if (!listed.ok) return listed;
  const choices: PropertyChoice[] = listed.properties.map((entry) => ({ ...entry, stream: null, checked: false }));
  const toCheck = choices.slice(0, MOST_PROPERTIES_CHECKED);
  for (let at = 0; at < toCheck.length; at += AT_ONCE) {
    const batch = toCheck.slice(at, at + AT_ONCE);
    const answers = await Promise.all(batch.map((choice) => webStreamAddresses(accessToken, choice.property)));
    for (const [index, answer] of answers.entries()) {
      // The account itself refused or expired: no point asking about the rest.
      if (!answer.ok && answer.reason === "EXPIRED") return answer;
      batch[index].checked = true;
      if (answer.ok) batch[index].stream = answer.addresses.find((address) => streamIsSite(address, siteHost)) ?? null;
    }
  }
  return {
    ok: true,
    choices: choices.sort((left, right) => Number(right.stream !== null) - Number(left.stream !== null)
      || left.displayName.localeCompare(right.displayName)),
  };
}

export type PropertyDetails = { displayName: string; timeZone: string; currencyCode: string };

/** A property's own name, time zone and currency (§2.5): every figure is in them. */
export async function propertyDetails(accessToken: string, property: string): Promise<{ ok: true; details: PropertyDetails } | GoogleFailure> {
  const answer = await callGoogle(`${ADMIN}/${property}`, accessToken);
  if (!answer.ok) return answer;
  const json = answer.json as { displayName?: string; timeZone?: string; currencyCode?: string };
  return {
    ok: true,
    details: { displayName: json.displayName ?? property, timeZone: json.timeZone ?? "UTC", currencyCode: json.currencyCode ?? "GBP" },
  };
}

export type KeyEvent = {
  /** The event's own name in Analytics (`generate_lead`). */
  eventName: string;
  /** The value each one is worth, when Analytics was given one, in the property's currency. */
  defaultValue: number | null;
  /** Counted once a visit, however often it happens in one (`ONCE_PER_SESSION`): Hakken counts the visits it happened in. */
  perVisit: boolean;
};

/** The property's key events: what may be ticked as a conversion (GA5). */
export async function listKeyEvents(accessToken: string, property: string): Promise<{ ok: true; events: KeyEvent[] } | GoogleFailure> {
  const answer = await callGoogle(`${ADMIN}/${property}/keyEvents?pageSize=200`, accessToken);
  if (!answer.ok) return answer;
  const events = (answer.json as { keyEvents?: { eventName?: string; defaultValue?: { numericValue?: number }; countingMethod?: string }[] }).keyEvents ?? [];
  return {
    ok: true,
    events: events.flatMap((event) => event.eventName
      ? [{
        eventName: event.eventName,
        defaultValue: typeof event.defaultValue?.numericValue === "number" ? event.defaultValue.numericValue : null,
        perVisit: event.countingMethod === "ONCE_PER_SESSION",
      }]
      : []),
  };
}

// ---------------------------------------------------------------------------
// The Data API
// ---------------------------------------------------------------------------

/**
 * Rows Google gives in one answer; more are paged with `offset`. 25,000 keeps
 * one answer near 8 MB of text and 20 MB once read
 * (ga-big-site-reliability-plan.md BR2; 100,000 until 2026-10-15).
 */
export const REPORT_PAGE_ROWS = 25_000;

/** Pages of a report read at most — 500,000 rows: a list longer than this is cut, and says so. */
export const MOST_REPORT_PAGES = 20;

/**
 * Where a report's rows go as each of Google's answers arrives (BR2), rather
 * than all held until the last: a page list adds them up and trims them as
 * they come (`googleAnalyticsPageLists.ts`).
 */
export type ReportSink = (rows: ReportRow[]) => void;
export type ReportPageGuard = (quota: QuotaLeft) => Promise<string | null> | string | null;

export type ReportAsk = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  /** Only these addresses' visits (`hostName`), and only these events (`eventName`), when given. */
  hostNames?: string[];
  eventNames?: string[];
  /**
   * Only what came from a page on one of these addresses (`pageReferrer`): which other addresses visitors reach
   * from the website (conversion-addresses-plan.md).
   */
  referredBy?: string[];
  /** Only this device (`deviceCategory`), when a page list is asked for one. */
  device?: string;
  /**
   * Only rows whose dimension is one of these values (a landing page's own
   * screen, slashed or not); several, each held to — visits that started on a
   * page and viewed it (analytics-page-screen-plan.md §4).
   */
  only?: { dimension: string; values: string[] } | ReadonlyArray<{ dimension: string; values: string[] }>;
  /**
   * Only visits from these countries, by Google's two-letter `countryId`: the
   * website's home country being collected (google-analytics-plan.md §18.6.1).
   */
  countries?: string[];
};

export type ReportRow = { keys: string[]; values: number[] };

/**
 * What is left of a website's allowances, as Google counts them on each
 * answer (`returnPropertyQuota`; docs/plans/active/ga-stored-figures-plan.md
 * SF18): its tokens today and this hour — every tool reading the property's,
 * and Hakken's own — and its asks this hour that may hold back small groups
 * (age, gender, interests). Null where Google did not say.
 */
export type QuotaLeft = {
  tokensPerDay: number | null;
  tokensPerHour: number | null;
  tokensPerProjectPerHour: number | null;
  thresholdedPerHour: number | null;
};

type QuotaStatus = { consumed?: number; remaining?: number };

/** Google's `propertyQuota`, as what is left; null when the answer carried none. */
export function quotaLeftOf(quota: Record<string, QuotaStatus | undefined> | undefined): QuotaLeft | null {
  if (!quota) return null;
  const left = (name: string) => (typeof quota[name]?.remaining === "number" ? quota[name]!.remaining! : null);
  return {
    tokensPerDay: left("tokensPerDay"),
    tokensPerHour: left("tokensPerHour"),
    tokensPerProjectPerHour: left("tokensPerProjectPerHour"),
    thresholdedPerHour: left("potentiallyThresholdedRequestsPerHour"),
  };
}

/** Dimensions whose asks Google counts against its 120 an hour that may hold back small groups. */
export const THRESHOLDED_DIMENSIONS: ReadonlySet<string> = new Set(["userAgeBracket", "userGender", "brandingInterest"]);

export type Report = {
  rows: ReportRow[];
  /** Google folded its rarest rows into "(other)" (§2.5). */
  folded: boolean;
  /** Google held back rows with few visitors (§2.5). */
  thresholded: boolean;
  /** Longer than Hakken reads: the rest left out. */
  cut: boolean;
  requests: number;
  /** What is left of the website's allowances after this ask, as Google counts them. */
  quota: QuotaLeft | null;
};

/** A page on one of these addresses, as Google writes a referrer: `https://www.nec.ac.uk/course/…`. */
export function referrerPattern(hosts: readonly string[]): string {
  const escaped = [...new Set(hosts.map((host) => host.trim().toLowerCase()).filter(Boolean))].map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return `https?://(${escaped.join("|")})([/:?#].*)?`;
}

function filterOf(ask: ReportAsk) {
  const filters: unknown[] = [];
  if (ask.hostNames?.length) {
    filters.push({ filter: { fieldName: "hostName", inListFilter: { values: ask.hostNames, caseSensitive: false } } });
  }
  if (ask.eventNames?.length) {
    filters.push({ filter: { fieldName: "eventName", inListFilter: { values: ask.eventNames, caseSensitive: true } } });
  }
  if (ask.referredBy?.length) {
    filters.push({ filter: { fieldName: "pageReferrer", stringFilter: { matchType: "FULL_REGEXP", value: referrerPattern(ask.referredBy), caseSensitive: false } } });
  }
  if (ask.device) {
    filters.push({ filter: { fieldName: "deviceCategory", stringFilter: { matchType: "EXACT", value: ask.device, caseSensitive: false } } });
  }
  for (const only of ask.only === undefined ? [] : "dimension" in ask.only ? [ask.only] : ask.only) {
    filters.push({ filter: { fieldName: only.dimension, inListFilter: { values: only.values, caseSensitive: true } } });
  }
  if (ask.countries?.length) {
    filters.push({ filter: { fieldName: "countryId", inListFilter: { values: ask.countries, caseSensitive: false } } });
  }
  if (filters.length === 0) return undefined;
  return filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } };
}

/**
 * Every row of one report, paged by `REPORT_PAGE_ROWS`. Google's own words for
 * what it left out come back with the rows, for the screens to say (§2.5).
 * With a `sink`, each answer's rows go to it as they arrive and none are held
 * here (BR2); `fromPage` carries on an ask Google stopped part-way from the
 * page it reached, which a failure names (`pagesRead`) — only with a sink,
 * which has the pages before it.
 */
export async function runReport(
  accessToken: string,
  property: string,
  ask: ReportAsk,
  sink?: ReportSink,
  fromPage = 0,
  pageGuard?: ReportPageGuard,
): Promise<({ ok: true } & Report) | (GoogleFailure & { pagesRead: number; requests: number })> {
  const url = `${DATA}/${property}:runReport`;
  const rows: ReportRow[] = [];
  let folded = false;
  let thresholded = false;
  let requests = 0;
  let total = 0;
  let seen = sink ? fromPage * REPORT_PAGE_ROWS : 0;
  let quota: QuotaLeft | null = null;
  for (let page = sink ? fromPage : 0; page < MOST_REPORT_PAGES; page += 1) {
    const filter = filterOf(ask);
    const answer = await callGoogle(url, accessToken, {
      dateRanges: [{ startDate: ask.startDate, endDate: ask.endDate }],
      dimensions: ask.dimensions.map((name) => ({ name })),
      metrics: ask.metrics.map((name) => ({ name })),
      ...(filter ? { dimensionFilter: filter } : {}),
      limit: REPORT_PAGE_ROWS,
      offset: page * REPORT_PAGE_ROWS,
      // What is left of the website's allowances, with every answer (SF18).
      returnPropertyQuota: true,
    });
    requests += 1;
    if (!answer.ok) return { ...answer, pagesRead: page, requests };
    const json = answer.json as {
      rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
      rowCount?: number;
      metadata?: { dataLossFromOtherRow?: boolean; subjectToThresholding?: boolean };
      propertyQuota?: Record<string, QuotaStatus | undefined>;
    };
    quota = quotaLeftOf(json.propertyQuota) ?? quota;
    folded ||= json.metadata?.dataLossFromOtherRow === true;
    thresholded ||= json.metadata?.subjectToThresholding === true;
    total = json.rowCount ?? 0;
    const answered = (json.rows ?? []).map((row) => ({
      keys: (row.dimensionValues ?? []).map((value) => value.value ?? ""),
      values: (row.metricValues ?? []).map((value) => Number(value.value ?? 0) || 0),
    }));
    seen += answered.length;
    if (sink) sink(answered);
    else for (const row of answered) rows.push(row);
    if (seen >= total || answered.length < REPORT_PAGE_ROWS) break;
    if (quota && pageGuard) {
      const stopped = await pageGuard(quota);
      if (stopped) {
        return {
          ok: false,
          reason: "BUDGET",
          status: 0,
          detail: stopped,
          pagesRead: page + 1,
          requests,
        };
      }
    }
  }
  return { ok: true, rows, folded, thresholded, cut: seen < total, requests, quota };
}

/**
 * One ask of Google's live figures (§18.6.7, GA34): the last 30 minutes, or a
 * stretch of them (`minutes`, 0 the minute now), split as asked. Live figures
 * cannot be filtered by the website's address — Google keeps no `hostName`
 * live — only by country, device and event.
 */
export type RealtimeAsk = Pick<ReportAsk, "dimensions" | "metrics" | "device" | "countries" | "eventNames"> & { minutes?: { from: number; to: number } };

/** Google's live figures for one ask (`runRealtimeReport`): nothing is kept. */
export async function runRealtimeReport(accessToken: string, property: string, ask: RealtimeAsk): Promise<{ ok: true; rows: ReportRow[] } | GoogleFailure> {
  const filter = filterOf({ ...ask, startDate: "", endDate: "" });
  const answer = await callGoogle(`${DATA}/${property}:runRealtimeReport`, accessToken, {
    dimensions: ask.dimensions.map((name) => ({ name })),
    metrics: ask.metrics.map((name) => ({ name })),
    ...(filter ? { dimensionFilter: filter } : {}),
    ...(ask.minutes ? { minuteRanges: [{ startMinutesAgo: ask.minutes.from, endMinutesAgo: ask.minutes.to }] } : {}),
    limit: 250,
  });
  if (!answer.ok) return answer;
  const json = answer.json as { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };
  return {
    ok: true,
    rows: (json.rows ?? []).map((row) => ({
      keys: (row.dimensionValues ?? []).map((value) => value.value ?? ""),
      values: (row.metricValues ?? []).map((value) => Number(value.value ?? 0) || 0),
    })),
  };
}

/** Google's funnel report: still in its `v1alpha` (§18.6.5). */
const FUNNEL = "https://analyticsdata.googleapis.com/v1alpha";

/**
 * Who did one event and, any time after, one of a set of others: an event's screen's "people who converted after it".
 * `thenHostNames`: the conversion on these addresses too (the website's own and its conversion addresses,
 * conversion-addresses-plan.md), the first event still on `hostNames` alone.
 */
export type FunnelAsk = Pick<ReportAsk, "startDate" | "endDate" | "hostNames" | "device" | "countries"> & { first: string; then: string[]; thenHostNames?: string[] };

const eventStep = (eventName: string) => ({ funnelEventFilter: { eventName } });
const hostStep = (hostNames: readonly string[]) => ({ funnelFieldFilter: { fieldName: "hostName", inListFilter: { values: [...hostNames], caseSensitive: false } } });

/**
 * The people who did one event, and of them the people who did one of the
 * others after it, at any time in the dates (Anthony, 2026-10-11: "Yes agree
 * use the people"): Google's funnel report, two steps, the second not
 * directly after the first. Google cannot join an event to conversions in the
 * same visit, so this counts people, not visits.
 */
export async function runFunnelReport(
  accessToken: string,
  property: string,
  ask: FunnelAsk,
): Promise<{ ok: true; did: number; then: number; narrowed?: true } | GoogleFailure> {
  // With conversion addresses, each step holds to its own addresses and the whole funnel to none.
  const apart = ask.thenHostNames !== undefined && ask.hostNames !== undefined && ask.hostNames.length > 0;
  const answer = await askFunnelOnce(accessToken, property, ask, apart);
  // Google refusing a step held to its own addresses (its funnel report is still in its alpha): asked again at once the
  // way it always was, on the website's own address, so the figure is never missing — said with it (`narrowed`).
  if (apart && !answer.ok && answer.reason === "REFUSED") {
    const plain = await askFunnelOnce(accessToken, property, ask, false);
    return plain.ok ? { ...plain, narrowed: true } : plain;
  }
  return answer;
}

/** One funnel ask of Google: each step held to its own addresses (`apart`), or the whole funnel to the website's. */
async function askFunnelOnce(accessToken: string, property: string, ask: FunnelAsk, apart: boolean): Promise<{ ok: true; did: number; then: number } | GoogleFailure> {
  const filter = filterOf({ ...ask, ...(apart ? { hostNames: undefined } : {}), dimensions: [], metrics: [] });
  const then = ask.then.length === 1 ? eventStep(ask.then[0]) : { orGroup: { expressions: ask.then.map(eventStep) } };
  const answer = await callGoogle(`${FUNNEL}/${property}:runFunnelReport`, accessToken, {
    dateRanges: [{ startDate: ask.startDate, endDate: ask.endDate }],
    funnel: {
      steps: [
        { name: "did", filterExpression: apart ? { andGroup: { expressions: [eventStep(ask.first), hostStep(ask.hostNames!)] } } : eventStep(ask.first) },
        {
          name: "then",
          isDirectlyFollowedBy: false,
          filterExpression: apart ? { andGroup: { expressions: [then, hostStep(ask.thenHostNames!)] } } : then,
        },
      ],
    },
    ...(filter ? { dimensionFilter: filter } : {}),
  });
  if (!answer.ok) return answer;
  const table = (answer.json as { funnelTable?: { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] } }).funnelTable;
  // Each step's row is named by its number and name ("1. did"); its first figure is the people who reached it.
  const people = (step: string) => {
    const row = (table?.rows ?? []).find((one) => (one.dimensionValues?.[0]?.value ?? "").endsWith(step));
    return Number(row?.metricValues?.[0]?.value ?? 0) || 0;
  };
  return { ok: true, did: people("did"), then: people("then") };
}

export type SiteAddresses = {
  /** The addresses read: the website's own, `www.` or not. */
  addresses: string[];
  /** The property's other addresses with visits, busiest first, left out of every figure. */
  others: string[];
  /** Every address's visits over the 30 days, busiest first. */
  visits: { host: string; visits: number }[];
};

/**
 * The listed events and sales on each of a property's addresses over the last
 * 30 days to `newest`, the most first: asked weekly with every address's
 * visits, for tracking health's "conversions elsewhere" (conversion-addresses-plan.md).
 */
export async function addressConversions(
  accessToken: string,
  property: string,
  eventNames: string[],
  newest: string,
  countries: string[],
): Promise<{ ok: true; found: Array<{ host: string; conversions: number }> } | GoogleFailure> {
  const days = lastThirtyDays(newest);
  const found = new Map<string, number>();
  const report = await runReport(accessToken, property, {
    startDate: days.from,
    endDate: days.to,
    dimensions: ["hostName"],
    metrics: ["eventCount"],
    eventNames,
    countries,
  }, (rows) => {
    for (const row of rows) {
      const host = (row.keys[0] ?? "").toLowerCase();
      if (host && host !== "(not set)" && row.values[0] > 0) found.set(host, (found.get(host) ?? 0) + row.values[0]);
    }
  });
  if (!report.ok) return report;
  return {
    ok: true,
    found: [...found].map(([host, conversions]) => ({ host, conversions })).sort((left, right) => right.conversions - left.conversions),
  };
}

/** The 30 days to a newest day: what the address and key event asks read. */
export function lastThirtyDays(newest: string): { from: string; to: string } {
  const from = new Date(Date.parse(`${newest}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from, to: newest };
}

/** Yesterday in UTC: the newest day asked before a property's own time zone is known. */
export function yesterdayUtc(now: number): string {
  return new Date(now - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Which of a property's addresses are this website (§3, step 4, chosen for the
 * client by §10, Q16): its visits by `hostName` over the last 30 days to
 * `newest`. A property with no visits yet reads the website's own host.
 */
export async function siteAddresses(
  accessToken: string,
  property: string,
  siteHost: string,
  newest: string,
): Promise<{ ok: true; found: SiteAddresses } | GoogleFailure> {
  const days = lastThirtyDays(newest);
  const report = await runReport(accessToken, property, {
    startDate: days.from,
    endDate: days.to,
    dimensions: ["hostName"],
    metrics: ["sessions"],
  });
  if (!report.ok) return report;
  const busiest = [...report.rows].sort((left, right) => right.values[0] - left.values[0]);
  const site = bareHost(siteHost);
  const addresses = busiest.filter((row) => row.keys[0] && bareHost(row.keys[0]) === site).map((row) => row.keys[0].toLowerCase());
  const others = busiest.filter((row) => row.keys[0] && bareHost(row.keys[0]) !== site && row.keys[0] !== "(not set)").map((row) => row.keys[0]);
  return {
    ok: true,
    found: {
      addresses: addresses.length > 0 ? [...new Set(addresses)] : [siteHost.toLowerCase()],
      others,
      visits: busiest.filter((row) => row.keys[0]).map((row) => ({ host: row.keys[0], visits: row.values[0] })),
    },
  };
}
