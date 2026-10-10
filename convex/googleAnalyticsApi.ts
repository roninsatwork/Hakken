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

/** A property's web streams' addresses (`https://www.ronins.co.uk`). */
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
};

/** The property's key events: what may be ticked as a conversion (GA5). */
export async function listKeyEvents(accessToken: string, property: string): Promise<{ ok: true; events: KeyEvent[] } | GoogleFailure> {
  const answer = await callGoogle(`${ADMIN}/${property}/keyEvents?pageSize=200`, accessToken);
  if (!answer.ok) return answer;
  const events = (answer.json as { keyEvents?: { eventName?: string; defaultValue?: { numericValue?: number } }[] }).keyEvents ?? [];
  return {
    ok: true,
    events: events.flatMap((event) => event.eventName
      ? [{ eventName: event.eventName, defaultValue: typeof event.defaultValue?.numericValue === "number" ? event.defaultValue.numericValue : null }]
      : []),
  };
}

// ---------------------------------------------------------------------------
// The Data API
// ---------------------------------------------------------------------------

/** Rows Google gives in one answer; more are paged with `offset`. */
export const REPORT_PAGE_ROWS = 100_000;

/** Pages of a report read at most: a list longer than this is cut, and says so. */
const MOST_REPORT_PAGES = 5;

export type ReportAsk = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  /** Only these addresses' visits (`hostName`), and only these events (`eventName`), when given. */
  hostNames?: string[];
  eventNames?: string[];
  /** Only this device (`deviceCategory`), when a page list is asked for one. */
  device?: string;
  /** Only rows whose dimension is one value (a landing page's own screen). */
  only?: { dimension: string; value: string };
};

export type ReportRow = { keys: string[]; values: number[] };

export type Report = {
  rows: ReportRow[];
  /** Google folded its rarest rows into "(other)" (§2.5). */
  folded: boolean;
  /** Google held back rows with few visitors (§2.5). */
  thresholded: boolean;
  /** Longer than Hakken reads: the rest left out. */
  cut: boolean;
  requests: number;
};

function filterOf(ask: ReportAsk) {
  const filters: unknown[] = [];
  if (ask.hostNames?.length) {
    filters.push({ filter: { fieldName: "hostName", inListFilter: { values: ask.hostNames, caseSensitive: false } } });
  }
  if (ask.eventNames?.length) {
    filters.push({ filter: { fieldName: "eventName", inListFilter: { values: ask.eventNames, caseSensitive: true } } });
  }
  if (ask.device) {
    filters.push({ filter: { fieldName: "deviceCategory", stringFilter: { matchType: "EXACT", value: ask.device, caseSensitive: false } } });
  }
  if (ask.only) {
    filters.push({ filter: { fieldName: ask.only.dimension, stringFilter: { matchType: "EXACT", value: ask.only.value, caseSensitive: true } } });
  }
  if (filters.length === 0) return undefined;
  return filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } };
}

/**
 * Every row of one report, paged by 100,000. Google's own words for what it
 * left out come back with the rows, for the screens to say (§2.5).
 */
export async function runReport(accessToken: string, property: string, ask: ReportAsk): Promise<({ ok: true } & Report) | GoogleFailure> {
  const url = `${DATA}/${property}:runReport`;
  const rows: ReportRow[] = [];
  let folded = false;
  let thresholded = false;
  let requests = 0;
  let total = 0;
  for (let page = 0; page < MOST_REPORT_PAGES; page += 1) {
    const filter = filterOf(ask);
    const answer = await callGoogle(url, accessToken, {
      dateRanges: [{ startDate: ask.startDate, endDate: ask.endDate }],
      dimensions: ask.dimensions.map((name) => ({ name })),
      metrics: ask.metrics.map((name) => ({ name })),
      ...(filter ? { dimensionFilter: filter } : {}),
      limit: REPORT_PAGE_ROWS,
      offset: page * REPORT_PAGE_ROWS,
    });
    requests += 1;
    if (!answer.ok) return answer;
    const json = answer.json as {
      rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
      rowCount?: number;
      metadata?: { dataLossFromOtherRow?: boolean; subjectToThresholding?: boolean };
    };
    folded ||= json.metadata?.dataLossFromOtherRow === true;
    thresholded ||= json.metadata?.subjectToThresholding === true;
    total = json.rowCount ?? 0;
    for (const row of json.rows ?? []) {
      rows.push({
        keys: (row.dimensionValues ?? []).map((value) => value.value ?? ""),
        values: (row.metricValues ?? []).map((value) => Number(value.value ?? 0) || 0),
      });
    }
    if (rows.length >= total || (json.rows ?? []).length < REPORT_PAGE_ROWS) break;
  }
  return { ok: true, rows, folded, thresholded, cut: rows.length < total, requests };
}

export type SiteAddresses = {
  /** The addresses read: the website's own, `www.` or not. */
  addresses: string[];
  /** The property's other addresses with visits, busiest first, left out of every figure. */
  others: string[];
  /** Every address's visits over the 30 days, busiest first. */
  visits: { host: string; visits: number }[];
};

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
