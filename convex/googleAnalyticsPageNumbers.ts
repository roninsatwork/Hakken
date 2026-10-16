import type { ActionCtx } from "./_generated/server";
import { addressesOf, encodePagesFromAction } from "./holdPageRefs";
import { channelKey, pageAddress, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { OTHER_ROWS } from "./utils/analyticsSharedLists";
import type { CollectTarget } from "./googleAnalyticsCollect";

/** No page of the website: Google's "(not set)", and a page's other rows added into one (`OTHER_ROWS`), kept as they are. */
const notPage = (address: string) => address === "(not set)" || address === OTHER_ROWS;

/**
 * A page list's addresses as the website's page numbers (`holdPageRefs.ts`),
 * shared with Search Console (§4.6). Analytics names a landing page without
 * its trailing slash (`landingPage`) where All pages and Search Console keep
 * it: a landing page is given the slashed address when the website holds that
 * one and not its own, so one page has one number.
 */
export async function numberPages(
  ctx: ActionCtx,
  target: CollectTarget,
  rows: ListRow[],
  list: "landing" | "page" | "landingChannel" | "landingAssistant",
  /** Each row keyed page then something more, kept beside the page's number: the lists by channel, a page's days (SF5). */
  keyedRows = list === "landingChannel" || list === "landingAssistant",
): Promise<ListRow[]> {
  const known = (await addressesOf(ctx, target.companyWebsiteId)).numbers;
  const landing = list !== "page";
  const addressOf = (path: string) => {
    const address = pageAddress(target.origin, path);
    if (!landing || notPage(address) || address.endsWith("/") || known.has(address)) return address;
    return known.has(`${address}/`) ? `${address}/` : address;
  };
  // A landing page by channel keeps its channel beside the page's number (Insights, §8).
  const keyed = keyedRows;
  const parts = rows.map((row) => (keyed ? splitChannelKey(row.key) : { channel: "", source: "" }));
  const addresses = rows.map((row, index) => addressOf(keyed ? parts[index].channel : row.key));
  const numbered = await encodePagesFromAction(ctx, target.companyWebsiteId, addresses.filter((address) => !notPage(address)));
  const refs = new Map<string, string>();
  let at = 0;
  for (const address of addresses) if (!notPage(address)) refs.set(address, numbered[at++]);
  // Two paths that are one address once cleaned are one row.
  const merged = new Map<string, ListRow>();
  rows.forEach((row, index) => {
    const page = refs.get(addresses[index]) ?? (addresses[index] === OTHER_ROWS ? OTHER_ROWS : "(not set)");
    const key = keyed ? channelKey(page, parts[index].source) : page;
    const held = merged.get(key);
    if (!held) {
      merged.set(key, { ...row, key });
      return;
    }
    for (const field of ["visits", "engaged", "seconds", "views", "purchases", "revenue", "people", "newPeople", "length"] as const) held[field] += row[field];
    if (row.times !== undefined) held.times = (held.times ?? 0) + row.times;
    if (row.basket !== undefined) held.basket = (held.basket ?? 0) + row.basket;
    if (row.converting !== undefined) held.converting = (held.converting ?? 0) + row.converting;
    for (const [event, count] of row.counts) held.counts.set(event, (held.counts.get(event) ?? 0) + count);
    for (const [event, value] of row.values) held.values.set(event, (held.values.get(event) ?? 0) + value);
  });
  return [...merged.values()];
}
