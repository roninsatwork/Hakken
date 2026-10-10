import type { AnalyticsList } from "./googleAnalyticsSchema";
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

/** The figures asked for every list's rows, in the order they are kept. */
export const MAIN_METRICS = ["sessions", "engagedSessions", "userEngagementDuration", "screenPageViews", "ecommercePurchases", "purchaseRevenue"] as const;

/** The figures asked for each key event of a row: how many, and the value Analytics gave them. */
export const EVENT_METRICS = ["keyEvents", "eventValue"] as const;

/** Each list's own split (§2.3). */
export const LIST_DIMENSIONS: Record<AnalyticsList, readonly string[]> = {
  total: [],
  channel: ["sessionDefaultChannelGroup", "sessionSource"],
  landing: ["landingPage"],
  page: ["pagePath"],
  series: ["date"],
};

/** Whether a list is kept by device (GA20): the small ones and the long charts; the page lists only for every device. */
export const KEPT_BY_DEVICE: Record<AnalyticsList, boolean> = {
  total: true,
  channel: true,
  series: true,
  landing: false,
  page: false,
};

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
  /** Each key event's count and value (in hundredths), by the event's name. */
  counts: Map<string, number>;
  values: Map<string, number>;
};

function emptyRow(key: string): ListRow {
  return { key, visits: 0, engaged: 0, seconds: 0, views: 0, purchases: 0, revenue: 0, counts: new Map(), values: new Map() };
}

const hundredths = (value: number) => Math.round(value * 100);

function rowKey(list: AnalyticsList, keys: readonly string[]): string {
  if (list === "total") return "";
  if (list === "channel") return channelKey(keys[0] ?? "", keys[1] ?? "");
  if (list === "series") return dayOf(keys[0] ?? "");
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
    for (const target of targets(row.keys)) {
      target.visits += row.values[0] ?? 0;
      target.engaged += row.values[1] ?? 0;
      target.seconds += row.values[2] ?? 0;
      target.views += row.values[3] ?? 0;
      target.purchases += row.values[4] ?? 0;
      target.revenue += hundredths(row.values[5] ?? 0);
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
  const sorted = list === "series"
    ? [...rows].sort((left, right) => left.key.localeCompare(right.key))
    : [...rows].sort((left, right) => (list === "page" ? right.views - left.views : right.visits - left.visits) || left.key.localeCompare(right.key));
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
