import type { AnalyticsList, AnalyticsPeriod, AnalyticsWhich } from "./googleAnalyticsSchema";
import type { ReportRow } from "./googleAnalyticsApi";
import { PART_ROWS, packNumbers, unpackNumbers } from "./utils/searchConsolePacks";

/**
 * What Google Analytics is asked for each kept list, and how its answers are
 * kept (docs/plans/active/google-analytics-plan.md §4.2, §4.3, GA23). No
 * database here: `googleAnalyticsCollect.ts` asks and writes.
 *
 * Every list is two asks of the Data API: its visits, engagement, views and
 * shop sales, and the same rows split by event for the property's key events
 * (`keyEvents`, `eventValue`). The two are joined into one row each, the
 * events as columns of their own (GA23: never a second list of the same
 * pages). A list kept by device is asked once with the device as a split, and
 * every device's figures are the devices' added up — each figure kept is a
 * count or a sum, so the parts add up to the whole exactly.
 */

/**
 * The figures asked for every list's rows, in the order they are kept: the
 * second round adds people, new people and how long visits lasted
 * (google-analytics-plan.md GA24, GA25, §18.6.2). Ten at most an ask.
 */
export const MAIN_METRICS = [
  "sessions", "engagedSessions", "userEngagementDuration", "screenPageViews", "ecommercePurchases", "purchaseRevenue",
  "totalUsers", "newUsers", "averageSessionDuration",
] as const;

/** The figures asked for each key event of a row: how many, and the value Analytics gave them. */
export const EVENT_METRICS = ["keyEvents", "eventValue"] as const;

/**
 * The figures asked for an event list's rows (§18.6.5): how many times it
 * happened, by how many people, and in how many visits — kept as `times`,
 * `people` and `visits`.
 */
export const EVENT_LIST_METRICS = ["eventCount", "totalUsers", "sessions"] as const;

/** The lists of events: one ask each, with their own figures, never joined to the key events. */
export function isEventList(list: AnalyticsList): list is "event" | "eventSeries" {
  return list === "event" || list === "eventSeries";
}

/**
 * The figures asked for a product list's rows (§18.6.6): looked at, added to
 * the basket, bought, and the revenue — kept as `views`, `basket`, `purchases`
 * and `revenue`. Google never mixes product figures with visit figures in one
 * ask, so a product list is asked on its own and never joined to key events.
 */
export const ITEM_METRICS = ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"] as const;

/** The lists of products: one ask each, with their own figures. */
export function isItemList(list: AnalyticsList): list is "product" | "productSeries" {
  return list === "product" || list === "productSeries";
}

/** The shop's four steps (§18.6.6), read from the events list: a website with any in the last 90 days is a shop. */
export const SHOP_STEPS = ["view_item", "add_to_cart", "begin_checkout", "purchase"] as const;

/** A day and what happened on it, as one key: a channel or an event each day (GA35, §18.6.5). */
export const DAY_JOIN = "\u001e";

/** Each list's own split (§2.3). */
export const LIST_DIMENSIONS: Record<AnalyticsList, readonly string[]> = {
  total: [],
  channel: ["sessionDefaultChannelGroup", "sessionSource"],
  landing: ["landingPage"],
  page: ["pagePath"],
  series: ["date"],
  event: ["eventName"],
  eventSeries: ["date", "eventName"],
  campaign: ["sessionCampaignName", "sessionSource", "sessionMedium"],
  adKeyword: ["sessionManualTerm"],
  campaignSeries: ["date", "sessionCampaignName"],
  visitorType: ["newVsReturning"],
  browser: ["browser"],
  system: ["operatingSystem"],
  age: ["userAgeBracket"],
  gender: ["userGender"],
  interest: ["brandingInterest"],
  visitorSeries: ["date", "newVsReturning"],
  product: ["itemName", "itemCategory"],
  productSeries: ["date"],
  // With its first source, so an assistant's referrals count as AI assistants, as the screens show them (utils/aiAssistants.ts).
  firstChannel: ["firstUserDefaultChannelGroup", "firstUserSource"],
  landingChannel: ["landingPage", "sessionDefaultChannelGroup"],
};

/** Whether a list is kept by device (GA20): the small ones and the long charts; the page lists only for every device. */
export const KEPT_BY_DEVICE: Record<AnalyticsList, boolean> = {
  total: true,
  channel: true,
  series: true,
  landing: false,
  page: false,
  // Every device only: a device chosen asks Google when the screen opens, as the page lists do.
  event: false,
  eventSeries: false,
  campaign: false,
  adKeyword: false,
  campaignSeries: false,
  visitorType: false,
  browser: false,
  system: false,
  age: false,
  gender: false,
  interest: false,
  visitorSeries: false,
  product: false,
  productSeries: false,
  firstChannel: false,
  landingChannel: false,
};

/** Visitors' lists (§18.6.6), in the order the screen's switch offers them. */
export const VISITOR_LISTS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const;
export type VisitorList = (typeof VISITOR_LISTS)[number];

/**
 * Visits from no tagged link (§18.6.6): Google names their campaign
 * `(not set)`, `(direct)`, `(organic)`, `(referral)` and the like. Kept as one
 * row, so a website that tags nothing keeps one row a day, not one a channel.
 */
export const UNTAGGED = "(not set)";

/** Whether a campaign, or a tagged link's words, is Google's word for none. */
export function isUntagged(name: string): boolean {
  return !name.trim() || /^\(.*\)$/.test(name.trim());
}

/** A live list's parts: 2,000 rows each, as many as Google gives in one list. */
export const LIVE_PARTS = 200;

/** Every device, as a kept record names it. */
export const EVERY_DEVICE = "";

/** A channel and its source, as one key. */
const JOIN = "\u001f";

export function channelKey(channel: string, source: string): string {
  return `${channel}${JOIN}${source}`;
}

export function splitChannelKey(key: string): { channel: string; source: string } {
  const at = key.indexOf(JOIN);
  return at < 0 ? { channel: key, source: "" } : { channel: key.slice(0, at), source: key.slice(at + JOIN.length) };
}

/** Google's `20261009` as `2026-10-09`. */
export function dayOf(date: string): string {
  return /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
}

/** One row of a kept list, its money in hundredths. */
export type ListRow = {
  key: string;
  visits: number;
  engaged: number;
  seconds: number;
  views: number;
  purchases: number;
  revenue: number;
  /**
   * People (`totalUsers`) and new people (`newUsers`). People cannot be added
   * up across days, devices or rows — one person on two devices is one person
   * — so only a row Google counted whole is right; every device's are asked
   * whole for the totals (§18.6.2).
   */
  people: number;
  newPeople: number;
  /** How long the visits lasted, in seconds all told: the average × visits, so it adds up. */
  length: number;
  /** An event's times (`eventCount`): only an event list's rows carry it, beside its people and its visits (§18.6.5). */
  times?: number;
  /** A product's adds to the basket (`itemsAddedToCart`): only a product list's rows carry it (§18.6.6). */
  basket?: number;
  /** Each key event's count and value (in hundredths), by the event's name. */
  counts: Map<string, number>;
  values: Map<string, number>;
};

export function emptyRow(key: string): ListRow {
  return { key, visits: 0, engaged: 0, seconds: 0, views: 0, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0, counts: new Map(), values: new Map() };
}

const hundredths = (value: number) => Math.round(value * 100);

function rowKey(list: AnalyticsList, keys: readonly string[]): string {
  if (list === "total") return "";
  if (list === "channel") return channelKey(keys[0] ?? "", keys[1] ?? "");
  if (list === "series") return dayOf(keys[0] ?? "");
  if (list === "eventSeries") return `${dayOf(keys[0] ?? "")}${DAY_JOIN}${keys[1] ?? ""}`;
  if (list === "campaignSeries") return `${dayOf(keys[0] ?? "")}${DAY_JOIN}${isUntagged(keys[1] ?? "") ? UNTAGGED : keys[1]}`;
  // A campaign with where its link was: "linkedin.com / social"; every untagged visit as one row.
  if (list === "campaign") return isUntagged(keys[0] ?? "") ? UNTAGGED : channelKey(keys[0] ?? "", `${keys[1] ?? ""} / ${keys[2] ?? ""}`);
  if (list === "adKeyword") return isUntagged(keys[0] ?? "") ? UNTAGGED : keys[0] ?? "";
  if (list === "visitorSeries") return `${dayOf(keys[0] ?? "")}${DAY_JOIN}${keys[1] ?? ""}`;
  if (list === "productSeries") return dayOf(keys[0] ?? "");
  // A product with its category: one name can sit in two.
  if (list === "product") return channelKey(keys[0] ?? "", keys[1] ?? "");
  // A landing page with the channel of its visits (Insights, §8): the page numbered as Landing pages' are.
  if (list === "landingChannel") return channelKey(keys[0] ?? "", keys[1] ?? "");
  // The channel that first brought a person, with the source it came by.
  if (list === "firstChannel") return channelKey(keys[0] ?? "", keys[1] ?? "");
  return keys[0] ?? "";
}

/**
 * The two asks' rows joined into each list's rows, grouped by what leads the
 * ask (`lead` splits: the day and the device for a day's records, the device
 * for a period kept by device). With the device among them, every device's
 * group is added up from the devices' and kept as `EVERY_DEVICE`.
 */
export function joinAsks(
  list: AnalyticsList,
  lead: readonly ("date" | "deviceCategory")[],
  main: readonly ReportRow[],
  events: readonly ReportRow[],
): Map<string, ListRow[]> {
  const width = LIST_DIMENSIONS[list].length;
  const deviceAt = lead.indexOf("deviceCategory");
  const groups = new Map<string, Map<string, ListRow>>();
  const rowOf = (leadKeys: string[], key: string) => {
    const group = leadKeys.join(JOIN);
    let rows = groups.get(group);
    if (!rows) groups.set(group, (rows = new Map()));
    let row = rows.get(key);
    if (!row) rows.set(key, (row = emptyRow(key)));
    return row;
  };
  // Each figure goes to its own device's group and, when kept by device, to every device's too.
  const targets = (keys: readonly string[]) => {
    const leadKeys = keys.slice(0, lead.length).map((value, index) => (lead[index] === "date" ? dayOf(value) : value.toLowerCase()));
    const key = rowKey(list, keys.slice(lead.length, lead.length + width));
    if (deviceAt < 0) return [rowOf(leadKeys, key)];
    const every = [...leadKeys];
    every[deviceAt] = EVERY_DEVICE;
    return [rowOf(leadKeys, key), rowOf(every, key)];
  };
  for (const row of main) {
    if (isItemList(list)) {
      // Looked at, added to the basket, bought, revenue (`ITEM_METRICS`).
      for (const target of targets(row.keys)) {
        target.views += row.values[0] ?? 0;
        target.basket = (target.basket ?? 0) + (row.values[1] ?? 0);
        target.purchases += row.values[2] ?? 0;
        target.revenue += hundredths(row.values[3] ?? 0);
      }
      continue;
    }
    if (isEventList(list)) {
      // Times, people and visits with one (`EVENT_LIST_METRICS`).
      for (const target of targets(row.keys)) {
        target.times = (target.times ?? 0) + (row.values[0] ?? 0);
        target.people += row.values[1] ?? 0;
        target.visits += row.values[2] ?? 0;
      }
      continue;
    }
    for (const target of targets(row.keys)) {
      target.visits += row.values[0] ?? 0;
      target.engaged += row.values[1] ?? 0;
      target.seconds += row.values[2] ?? 0;
      target.views += row.values[3] ?? 0;
      target.purchases += row.values[4] ?? 0;
      target.revenue += hundredths(row.values[5] ?? 0);
      target.people += row.values[6] ?? 0;
      target.newPeople += row.values[7] ?? 0;
      target.length += Math.round((row.values[8] ?? 0) * (row.values[0] ?? 0));
    }
  }
  for (const row of events) {
    const eventName = row.keys[lead.length + width] ?? "";
    if (!eventName) continue;
    for (const target of targets(row.keys)) {
      target.counts.set(eventName, (target.counts.get(eventName) ?? 0) + (row.values[0] ?? 0));
      target.values.set(eventName, (target.values.get(eventName) ?? 0) + hundredths(row.values[1] ?? 0));
    }
  }
  const out = new Map<string, ListRow[]>();
  for (const [group, rows] of groups) out.set(group, [...rows.values()]);
  return out;
}

/** The lead keys of a joined group, as `joinAsks` made them. */
export function groupKeys(group: string): string[] {
  return group.split(JOIN);
}

/** A kept list's part, as stored (`analyticsPackedRows`). */
export type PackedPart = {
  keys: string[];
  visits: string;
  engaged: string;
  seconds: string;
  views: string;
  purchases: string;
  revenue: string;
  /** People, new people and visit seconds; missing on a part kept before the second round. */
  people?: string;
  newPeople?: string;
  length?: string;
  /** An event's times: only an event list's parts. */
  times?: string;
  /** A product's adds to the basket: only a product list's parts. */
  basket?: string;
  events: string[];
  counts: string[];
  values: string[];
};

/**
 * A list's rows packed into parts of 2,000, the busiest first — by visits,
 * or by views for all pages — so the first part holds what a short list
 * shows. Every event named in `events` gets a column, whether any row had one
 * or not.
 */
export function packList(list: AnalyticsList, rows: readonly ListRow[], events: readonly string[]): PackedPart[] {
  const sorted = list === "series" || list === "eventSeries" || list === "campaignSeries" || list === "visitorSeries" || list === "productSeries"
    ? [...rows].sort((left, right) => left.key.localeCompare(right.key))
    : [...rows].sort((left, right) => (
      list === "page" || list === "product" ? right.views - left.views : list === "event" ? (right.times ?? 0) - (left.times ?? 0) : right.visits - left.visits
    ) || left.key.localeCompare(right.key));
  const timed = rows.some((row) => row.times !== undefined);
  const carted = rows.some((row) => row.basket !== undefined);
  const parts: PackedPart[] = [];
  for (let start = 0; start < Math.max(sorted.length, 1); start += PART_ROWS) {
    const slice = sorted.slice(start, start + PART_ROWS);
    parts.push({
      keys: slice.map((row) => row.key),
      visits: packNumbers(slice.map((row) => row.visits)),
      engaged: packNumbers(slice.map((row) => row.engaged)),
      seconds: packNumbers(slice.map((row) => row.seconds)),
      views: packNumbers(slice.map((row) => row.views)),
      purchases: packNumbers(slice.map((row) => row.purchases)),
      revenue: packNumbers(slice.map((row) => row.revenue)),
      people: packNumbers(slice.map((row) => row.people)),
      newPeople: packNumbers(slice.map((row) => row.newPeople)),
      length: packNumbers(slice.map((row) => row.length)),
      ...(timed ? { times: packNumbers(slice.map((row) => row.times ?? 0)) } : {}),
      ...(carted ? { basket: packNumbers(slice.map((row) => row.basket ?? 0)) } : {}),
      events: [...events],
      counts: events.map((event) => packNumbers(slice.map((row) => row.counts.get(event) ?? 0))),
      values: events.map((event) => packNumbers(slice.map((row) => row.values.get(event) ?? 0))),
    });
  }
  return parts;
}

/** A kept part's rows, back as numbers. */
export function unpackPart(part: PackedPart): ListRow[] {
  const visits = unpackNumbers(part.visits);
  const engaged = unpackNumbers(part.engaged);
  const seconds = unpackNumbers(part.seconds);
  const views = unpackNumbers(part.views);
  const purchases = unpackNumbers(part.purchases);
  const revenue = unpackNumbers(part.revenue);
  const people = part.people ? unpackNumbers(part.people) : [];
  const newPeople = part.newPeople ? unpackNumbers(part.newPeople) : [];
  const length = part.length ? unpackNumbers(part.length) : [];
  const times = part.times ? unpackNumbers(part.times) : null;
  const basket = part.basket ? unpackNumbers(part.basket) : null;
  const counts = part.counts.map((column) => unpackNumbers(column));
  const values = part.values.map((column) => unpackNumbers(column));
  return part.keys.map((key, index) => ({
    key,
    visits: visits[index] ?? 0,
    engaged: engaged[index] ?? 0,
    seconds: seconds[index] ?? 0,
    views: views[index] ?? 0,
    purchases: purchases[index] ?? 0,
    revenue: revenue[index] ?? 0,
    people: people[index] ?? 0,
    newPeople: newPeople[index] ?? 0,
    length: length[index] ?? 0,
    ...(times ? { times: times[index] ?? 0 } : {}),
    ...(basket ? { basket: basket[index] ?? 0 } : {}),
    counts: new Map(part.events.map((event, at) => [event, counts[at][index] ?? 0])),
    values: new Map(part.events.map((event, at) => [event, values[at][index] ?? 0])),
  }));
}

/** Whether two builds of a list hold the same figures: an unchanged list is not written again (GA23). */
export function samePacked(left: readonly PackedPart[], right: readonly PackedPart[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** A short fingerprint of a list's parts, kept beside a ready-made list so an unchanged one is not written again (GA23). */
export async function fingerprint(parts: readonly PackedPart[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A page's whole address, from the website's own origin and the path Analytics gives (§4.6). */
export function pageAddress(origin: string, path: string): string {
  if (!path || path === "(not set)") return "(not set)";
  const clean = path.split("#")[0].split("?")[0];
  return `${origin.replace(/\/+$/, "")}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/**
 * A ready-made list's name: the list, the period, which span, and the device
 * (empty for every device). Here rather than beside the collection, so a
 * reader such as the hold's page list (`holdPages.ts`) names it without
 * importing the collection. The main home country's lists carry no country,
 * as Search Console's don't; each other home country's end with its code
 * (`gbr`), google-analytics-plan.md §18.6.1.
 */
export function slotKey(list: AnalyticsList, period: AnalyticsPeriod, which: AnalyticsWhich, device: string, country = ""): string {
  return `${list}|${period}|${which}|${device}${country ? `|${country}` : ""}`;
}

/** The home country a kept list's name ends with: empty for the main one. */
export function countryOfKey(key: string): string {
  return key.split("|")[4] ?? "";
}

// ---------------------------------------------------------------------------
// The page before (google-analytics-plan.md GA29, §18.6.4)
// ---------------------------------------------------------------------------

/** What a view came from: a page of the website, another website, or nothing Google could name. */
export type BeforeKind = "page" | "site" | "none";

/** Websites named as people know them — search engines, social networks, chat — beside the AI assistants (`assistantOf`). */
const SEARCH_ENGINES: ReadonlyArray<[string, string]> = [
  ["google.", "Google"], ["bing.com", "Bing"], ["duckduckgo.com", "DuckDuckGo"], ["yahoo.", "Yahoo"], ["ecosia.org", "Ecosia"],
  ["baidu.com", "Baidu"], ["yandex.", "Yandex"], ["linkedin.com", "LinkedIn"], ["lnkd.in", "LinkedIn"], ["facebook.com", "Facebook"],
  ["instagram.com", "Instagram"], ["x.com", "X"], ["t.co", "X"], ["youtube.com", "YouTube"], ["reddit.com", "Reddit"],
  // A link opened from a Teams chat comes from Teams' own address (Ronins, 2026-10-11).
  ["teams.public.onecdn.static.microsoft", "Microsoft Teams"], ["teams.microsoft.com", "Microsoft Teams"], ["teams.live.com", "Microsoft Teams"],
];

/**
 * A website's name as people know it — Google, ChatGPT, LinkedIn — else its
 * own address, `www.` left off. A source Analytics names by its bare word
 * (`google`, `bing`: a visit from search) is the same website.
 */
export function siteNameOf(host: string, assistantOf: (source: string) => string | null): string {
  const bare = host.toLowerCase().replace(/^www\./, "");
  const assistant = assistantOf(bare);
  if (assistant) return assistant;
  const known = SEARCH_ENGINES.find(([stem]) => {
    const word = stem.split(".")[0];
    if (word.length > 2 && bare === word) return true;
    return stem.endsWith(".") ? bare.startsWith(stem) || bare.includes(`.${stem}`) : bare === stem || bare.endsWith(`.${stem}`);
  });
  return known ? known[1] : bare;
}

/**
 * A view's page before (`pageReferrer`) as one key: `page:<path>` for a page
 * of the website — its own addresses, `www.` or not; the live ask numbers it
 * (`page:~…`) — `site:<host>` for another website, and `none` when Google
 * names nothing: typed in, a bookmark, an app.
 */
export function beforeKey(referrer: string, addresses: readonly string[]): string {
  const value = referrer.trim();
  if (!value || value === "(not set)" || value === "(direct)") return "none";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "none";
  }
  const host = url.hostname.toLowerCase();
  const own = addresses.some((address) => address.toLowerCase().replace(/^www\./, "") === host.replace(/^www\./, ""));
  return own ? `page:${url.pathname || "/"}` : `site:${host.replace(/^www\./, "")}`;
}

/** A key's kind and what follows it. */
export function splitBeforeKey(key: string): { kind: BeforeKind; value: string } {
  if (key.startsWith("page:")) return { kind: "page", value: key.slice(5) };
  if (key.startsWith("site:")) return { kind: "site", value: key.slice(5) };
  return { kind: "none", value: "" };
}

/** Where a page's visitors were just before, as a share of its views (insights-analyst-plan.md I36). */
export type Journey = { kind: BeforeKind; label: string; share: number };

/**
 * Each page's journeys from one report of `pagePath` by `pageReferrer`:
 * `asked` maps each path Analytics may name (slash or not) to the page it is
 * filed under. A page before itself is a reload, not a journey, and is left
 * out; another website is named as people know it, so Google's many
 * addresses add up to one row. The biggest `kept` of each, shares to one place.
 */
export function journeysOf(
  rows: readonly ReportRow[],
  asked: ReadonlyMap<string, string>,
  addresses: readonly string[],
  assistantOf: (source: string) => string | null,
  kept: number,
): Map<string, Journey[]> {
  const views = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const page = asked.get(row.keys[0] ?? "");
    if (!page) continue;
    const { kind, value } = splitBeforeKey(beforeKey(row.keys[1] ?? "", addresses));
    if (kind === "page" && value.replace(/\/+$/, "") === page.replace(/\/+$/, "")) continue;
    const key = kind === "site" ? `site:${siteNameOf(value, assistantOf)}` : kind === "page" ? `page:${value}` : "none";
    const held = views.get(page) ?? new Map<string, number>();
    held.set(key, (held.get(key) ?? 0) + (row.values[0] ?? 0));
    views.set(page, held);
  }
  const out = new Map<string, Journey[]>();
  for (const [page, held] of views) {
    const total = [...held.values()].reduce((sum, count) => sum + count, 0);
    if (total === 0) continue;
    out.set(page, [...held.entries()].sort((a, b) => b[1] - a[1]).slice(0, kept).map(([key, count]) => {
      const { kind, value } = splitBeforeKey(key);
      return { kind, label: value, share: Math.round((count / total) * 1000) / 10 };
    }));
  }
  return out;
}
