/**
 * The addresses a website's conversions are counted on
 * (docs/plans/active/conversion-addresses-plan.md): a Google Analytics
 * property records visits on more addresses than the website's own — a shop
 * (`store.nec.ac.uk`), a booking page on another company's domain, a staging
 * copy, Google Translate's copy, spam. Visits and pages are only ever the
 * website's own; its conversions and sales are counted on the other addresses
 * Hakken picks here too, so a sale on the shop is credited to the visit that
 * came from the website.
 *
 * Pure: read by the connection (`googleAnalyticsConnect.ts`), the collection,
 * the health checks and the Connection page alike.
 */

/** Why an address is, or isn't, read for conversions. */
export type AddressKind = "SAME_DOMAIN" | "OTHER_DOMAIN" | "COPY";

/** A listed event, or a sale, on one address: how many in 12 months and in the last 30 days. */
export type AddressEvent = { eventName: string; year: number; month: number };

/** One of the property's other addresses, as the connection holds it. */
export type HeldAddress = {
  host: string;
  kind: AddressKind;
  /** Visitors reached it from the website in the last 12 months: a page on it had the website as its referrer. */
  reached: boolean;
  /** The listed events, and sales, that happened on it. */
  events: AddressEvent[];
  /** The admin's tick on the Connection page, held only when it differs from Hakken's choice. */
  counted?: boolean;
};

/** Google's sale: watched on every address, ticked or not, since the sales figures read it whatever counts. */
export const SALE_EVENT = "purchase";

/** Other addresses held, the most conversions first: a property full of spam keeps the rest in its plain list. */
export const MOST_ADDRESSES = 50;

/**
 * Words in an address that mark a copy of a website rather than a part of it:
 * a staging, test or development site, a demo. Read whole, between dots and
 * dashes, so `contest` or `devon` is not one.
 */
const COPY_WORDS: ReadonlySet<string> = new Set([
  "staging", "stage", "stg", "test", "testing", "dev", "develop", "development", "demo", "uat", "qa", "preview", "sandbox",
  "local", "localhost",
]);

/** Endings no live website sits on: a machine's own names (More Handles' `morehandles.loc`). */
const COPY_ENDINGS_TLD: ReadonlySet<string> = new Set(["loc", "local", "localhost", "test", "invalid", "example", "internal", "lan", "home"]);

/**
 * Services that show a website's pages under their own address: Google
 * Translate (`www-nec-ac-uk.translate.goog`), Google's cache, the Internet
 * Archive, a developer's machine (`ddev.site`) or a hosting panel's preview
 * (`plesk.page`, More Handles' `silly-mclean.77-68-13-134.plesk.page`).
 */
const COPY_SERVICES: readonly string[] = [
  "translate.goog", "googleusercontent.com", "archive.org", "ddev.site", "plesk.page", "ngrok.io", "ngrok-free.app", "ngrok.app",
];

/** An address as Hakken compares them: lowercase, no `www.`, no port. */
export function plainHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "").replace(/^www\./, "");
}

/**
 * Whether an address is a copy of a website, by its name alone. An ending no
 * live website sits on says nothing when the website itself sits on it (the
 * tests' own `acme-shop.test`).
 */
export function isCopyAddress(host: string, site = ""): boolean {
  const plain = plainHost(host);
  if (!plain || plain === "(not set)") return true;
  // A bare machine address: four numbers, or an IPv6 one.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(plain) || plain.includes(":") || plain.startsWith("[")) return true;
  if (COPY_SERVICES.some((service) => plain === service || plain.endsWith(`.${service}`))) return true;
  const labels = plain.split(".");
  const ending = labels[labels.length - 1];
  if (labels.length < 2 || (COPY_ENDINGS_TLD.has(ending) && plainHost(site).split(".").pop() !== ending)) return true;
  // The words before the ending: `nec.staging.cm-hosting.com` is a staging site; `korda.withcandour.dev` is not by name.
  return labels.slice(0, -1).some((label) => label.split("-").some((word) => COPY_WORDS.has(word)));
}

/** Whether an address is under the website's own (`store.nec.ac.uk` under `nec.ac.uk`), and not the website itself. */
export function isSameDomain(host: string, site: string): boolean {
  const plain = plainHost(host);
  const own = plainHost(site);
  return own !== "" && plain !== own && plain.endsWith(`.${own}`);
}

/** What an address is to a website: a part of it under its own address, another domain, or a copy. */
export function kindOf(host: string, site: string): AddressKind {
  if (isCopyAddress(host, site)) return "COPY";
  return isSameDomain(host, site) ? "SAME_DOMAIN" : "OTHER_DOMAIN";
}

/**
 * Hakken's own choice (conversion-addresses-plan.md): an address under the
 * website's own counts when a listed conversion or a sale happened on it in 12
 * months; one on another domain only when visitors also reached it from the
 * website — a checkout is reached from the website, a copy of its tag on
 * someone else's site never is (our own agency's property records a dozen). A
 * copy never counts.
 */
export function hakkenCounts(address: Pick<HeldAddress, "kind" | "reached" | "events">): boolean {
  if (address.kind === "COPY") return false;
  const converts = address.events.some((event) => event.year > 0);
  return converts && (address.kind === "SAME_DOMAIN" || address.reached);
}

/** Whether an address's conversions count: the admin's tick, or else Hakken's choice. */
export function countsConversions(address: Pick<HeldAddress, "kind" | "reached" | "events" | "counted">): boolean {
  return address.counted ?? hakkenCounts(address);
}

/** The other addresses whose conversions and sales count, as held. */
export function conversionAddressesOf(held: readonly HeldAddress[] | undefined): string[] {
  return (held ?? []).filter((address) => countsConversions(address)).map((address) => address.host);
}

/** A report's row by address and event: Google's `hostName`, `eventName` and a count. */
export type AddressRow = { host: string; eventName: string; count: number };

/**
 * The property's other addresses worth holding, read from Google's answers
 * when what counts is read: each under the website's own, reached from it, or
 * with a listed event or a sale in 12 months — the most conversions first, at
 * most `MOST_ADDRESSES`. An admin's tick held before stays.
 */
export function readAddresses(input: {
  site: string;
  own: readonly string[];
  listed: readonly string[];
  year: readonly AddressRow[];
  month: readonly AddressRow[];
  reached: ReadonlySet<string>;
  before?: readonly HeldAddress[];
}): HeldAddress[] {
  const ownHosts = new Set(input.own.map(plainHost));
  const watched = new Set([...input.listed, SALE_EVENT]);
  const before = new Map((input.before ?? []).map((address) => [address.host, address]));
  const byHost = new Map<string, Map<string, AddressEvent>>();
  const hostOf = (host: string) => host.trim().toLowerCase();
  const tally = (rows: readonly AddressRow[], field: "year" | "month") => {
    for (const row of rows) {
      const host = hostOf(row.host);
      if (!host || ownHosts.has(plainHost(host)) || !watched.has(row.eventName) || row.count <= 0) continue;
      const events = byHost.get(host) ?? new Map<string, AddressEvent>();
      const event = events.get(row.eventName) ?? { eventName: row.eventName, year: 0, month: 0 };
      event[field] += row.count;
      events.set(row.eventName, event);
      byHost.set(host, events);
    }
  };
  tally(input.year, "year");
  tally(input.month, "month");
  const hosts = new Set<string>([...byHost.keys(), ...[...input.reached].map(hostOf)]);
  for (const row of [...input.year, ...input.month]) {
    if (isSameDomain(row.host, input.site)) hosts.add(hostOf(row.host));
  }
  const held = [...hosts]
    .filter((host) => host && host !== "(not set)" && !ownHosts.has(plainHost(host)))
    .map((host): HeldAddress => {
      const events = [...(byHost.get(host)?.values() ?? [])].sort((left, right) => right.year - left.year || left.eventName.localeCompare(right.eventName));
      const kept = before.get(host);
      const address: HeldAddress = { host, kind: kindOf(host, input.site), reached: input.reached.has(host), events };
      // The admin's tick stays only while it still differs from what Hakken would choose.
      return kept?.counted !== undefined && kept.counted !== hakkenCounts(address) ? { ...address, counted: kept.counted } : address;
    });
  const conversions = (address: HeldAddress) => address.events.reduce((sum, event) => sum + event.year, 0);
  return held.sort((left, right) => conversions(right) - conversions(left) || left.host.localeCompare(right.host)).slice(0, MOST_ADDRESSES);
}

/**
 * An event's count in the last 30 days on the website's own address and every
 * other address whose conversions count: what the Connection page shows beside
 * it. `counted` says which addresses count, the held choice unless a draft says
 * otherwise.
 */
export function monthWithAddresses<Address extends HeldAddress>(
  event: { eventName: string; lastThirtyDays: number },
  held: readonly Address[],
  counted: (address: Address) => boolean = countsConversions,
): number {
  return held.reduce((sum, address) => sum + (counted(address) ? address.events.find((one) => one.eventName === event.eventName)?.month ?? 0 : 0), event.lastThirtyDays);
}

/** The events with their counts on every address that counts: what the Connection page and What Hakken sees read. */
export function eventsWithAddresses<Event extends { eventName: string; lastThirtyDays: number }, Address extends HeldAddress>(
  events: readonly Event[],
  held: readonly Address[],
  counted: (address: Address) => boolean = countsConversions,
): Event[] {
  return events.map((event) => ({ ...event, lastThirtyDays: monthWithAddresses(event, held, counted) }));
}
