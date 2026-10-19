import { runReport, lastThirtyDays, type ReportRow } from "./googleAnalyticsApi";
import type { GoogleFailure } from "./googleApi";
import { shiftDay } from "./searchConsoleDays";
import { readsAsEnquiry } from "./utils/analyticsEvents";
import {
  SALE_EVENT,
  conversionAddressesOf,
  isSameDomain,
  kindOf,
  plainHost,
  readAddresses,
  type AddressRow,
  type HeldAddress,
} from "./utils/analyticsAddresses";

/** Events that read as enquiries listed beside the key events, the most seen first (conversions-back-in-time-plan.md BT2). */
export const MOST_ENQUIRY_EVENTS = 20;

/**
 * A property's events by address, read when what counts is read
 * (conversion-addresses-plan.md): the last 12 months' events on every
 * address, the other addresses visitors reach from the website, and the last
 * 30 days of the listed events and sales on each. From them, the events that
 * read as enquiries to list beside the key events — looked for on the
 * website's own address and every other a conversion could count on — and the
 * other addresses as held. Each answer added up as it arrives (RR2).
 */
export async function readEventsByAddress(
  accessToken: string,
  property: string,
  ask: {
    own: string[];
    site: string;
    country: string;
    newest: string;
    keyNames: ReadonlySet<string>;
    before: HeldAddress[];
  },
): Promise<
  | {
    ok: true;
    enquiries: string[];
    held: HeldAddress[];
    /** An event's last 30 days on the website's own address. */
    ownCount: (eventName: string) => number;
    /** An event's last 30 days, and the value sent with it, on every address whose conversions count. */
    counting: (eventName: string) => { times: number; value: number };
  }
  | GoogleFailure
> {
  const ownHosts = new Set(ask.own.map(plainHost));
  const isOwn = (host: string) => ownHosts.has(plainHost(host));
  const year = new Map<string, AddressRow>();
  const tally = (into: Map<string, AddressRow>, at = 0) => (rows: ReportRow[]) => {
    for (const row of rows) {
      const key = `${row.keys[0]}\u001e${row.keys[1]}`;
      const held = into.get(key) ?? { host: row.keys[0], eventName: row.keys[1], count: 0 };
      held.count += row.values[at] ?? 0;
      into.set(key, held);
    }
  };
  const yearAnswer = await runReport(accessToken, property, {
    startDate: shiftDay(ask.newest, -364),
    endDate: ask.newest,
    dimensions: ["hostName", "eventName"],
    metrics: ["eventCount"],
    countries: [ask.country],
  }, tally(year));
  if (!yearAnswer.ok) return yearAnswer;
  const reached = new Set<string>();
  const reachedAnswer = await runReport(accessToken, property, {
    startDate: shiftDay(ask.newest, -364),
    endDate: ask.newest,
    dimensions: ["hostName"],
    metrics: ["eventCount"],
    referredBy: ask.own,
  }, (rows) => {
    for (const row of rows) if (row.values[0] > 0 && !isOwn(row.keys[0])) reached.add(row.keys[0].trim().toLowerCase());
  });
  if (!reachedAnswer.ok) return reachedAnswer;
  const yearRows = [...year.values()];
  // An enquiry is looked for where a conversion could count: the website's own address, and every other that is no
  // copy and is under the website's own or reached from it.
  const readable = (host: string) => isOwn(host)
    || (kindOf(host, ask.site) !== "COPY" && (isSameDomain(host, ask.site) || reached.has(host.trim().toLowerCase())));
  const seen = new Map<string, number>();
  for (const row of yearRows) if (readable(row.host)) seen.set(row.eventName, (seen.get(row.eventName) ?? 0) + row.count);
  // The events that read as enquiries, seen in the last 12 months, beside the key events: Hakken counts them from
  // Google's own counts, marked as key events or not (BT2).
  const enquiries = [...seen]
    .filter(([eventName, count]) => !ask.keyNames.has(eventName) && readsAsEnquiry(eventName) && count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, MOST_ENQUIRY_EVENTS)
    .map(([eventName]) => eventName);
  const names = [...ask.keyNames, ...enquiries];
  // The last 30 days of each, and of sales, by address: a failure leaves them at nought, as before.
  const month = new Map<string, AddressRow>();
  const values = new Map<string, AddressRow>();
  if (names.length > 0) {
    const both = (rows: ReportRow[]) => {
      tally(month)(rows);
      tally(values, 1)(rows);
    };
    await runReport(accessToken, property, {
      startDate: lastThirtyDays(ask.newest).from,
      endDate: ask.newest,
      dimensions: ["hostName", "eventName"],
      metrics: ["eventCount", "eventValue"],
      eventNames: [...new Set([...names, SALE_EVENT])],
      countries: [ask.country],
    }, both);
  }
  const monthRows = [...month.values()];
  const held = readAddresses({ site: ask.site, own: ask.own, listed: names, year: yearRows, month: monthRows, reached, before: ask.before });
  const counting = new Set([...ask.own, ...conversionAddressesOf(held)].map((host) => host.trim().toLowerCase()));
  const sum = (rows: Iterable<AddressRow>, eventName: string, keep: (host: string) => boolean) => {
    let total = 0;
    for (const row of rows) if (row.eventName === eventName && keep(row.host)) total += row.count;
    return total;
  };
  return {
    ok: true,
    enquiries,
    held,
    ownCount: (eventName) => sum(monthRows, eventName, isOwn),
    counting: (eventName) => {
      const keep = (host: string) => counting.has(host.trim().toLowerCase());
      return { times: sum(monthRows, eventName, keep), value: sum(values.values(), eventName, keep) };
    },
  };
}
