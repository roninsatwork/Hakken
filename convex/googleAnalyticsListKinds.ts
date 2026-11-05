import { v, type Infer } from "convex/values";
import type { ShownRow } from "./googleAnalyticsRows";
import type { ListSorts } from "./siteListPages";
import { VISITOR_LISTS, type VisitorList } from "./googleAnalyticsLists";

/** Which lists Google Analytics' screens read, and the orders each can be read in (moved out of `googleAnalyticsReads.ts`, 2026-11-05). */

/** Every order a list can be read in, on the server, over the whole list. */
export const LIST_SORTS: ListSorts<ShownRow, "name" | "visits" | "engaged" | "bounce" | "pages" | "people" | "length" | "time" | "views" | "conversions" | "rate" | "value" | "change" | "viewsChange" | "conversionsChange" | "visitsBefore" | "visitsChange" | "bought" | "started" | "elsewhere" | "share" | "left" | "onward" | "next" | "leftVisits" | "onwardVisits"> = {
  name: { value: (row) => row.label, first: "asc" },
  visits: { value: (row) => row.visits, first: "desc" },
  engaged: { value: (row) => row.engagementRate, first: "desc" },
  // The fewest bouncing first: the best first, as every Sites table sorts (sortOrder.ts).
  bounce: { value: (row) => row.bounceRate, first: "asc" },
  pages: { value: (row) => row.pagesPerVisit, first: "desc" },
  people: { value: (row) => row.people, first: "desc" },
  length: { value: (row) => row.lengthPerVisit, first: "desc" },
  time: { value: (row) => row.timePerVisit, first: "desc" },
  views: { value: (row) => row.views, first: "desc" },
  conversions: { value: (row) => row.conversions, first: "desc" },
  rate: { value: (row) => row.conversionRate, first: "desc" },
  value: { value: (row) => row.value, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  // All pages' two changes, as counts (all-pages-rethink-plan.md AP4): the most gained first.
  viewsChange: { value: (row) => (row.viewsBefore === null ? null : row.views - row.viewsBefore), first: "desc" },
  conversionsChange: { value: (row) => (row.conversionsBefore === null ? null : row.conversions - row.conversionsBefore), first: "desc" },
  // Campaigns' table (campaigns-new-page-plan-2026-11-05.md, step 6): the dates before, up or down as a count, and what was bought.
  visitsBefore: { value: (row) => row.visitsBefore ?? null, first: "desc" },
  visitsChange: { value: (row) => (row.visitsBefore == null ? null : row.visits - row.visitsBefore), first: "desc" },
  bought: { value: (row) => row.purchases, first: "desc" },
  // Channels' conversions started (ga-channel-pages-plan.md CH9).
  started: { value: (row) => row.started ?? null, first: "desc" },
  // AI assistants' visits Google filed elsewhere (CH8).
  elsewhere: { value: (row) => row.elsewhere ?? null, first: "desc" },
  // A channel's classifications by their share of its visits (CH7): the same order as their visits.
  share: { value: (row) => row.visits, first: "desc" },
  // Landing pages' funnel (LF4), by share, so a page's size does not decide: the fewest leaving first, the most going on first,
  // the strongest single next step first. Ask Hakken's orders (leftVisits, onwardVisits) by how many people, so it does.
  left: { value: (row) => (row.onward == null || row.visits === 0 ? null : (row.visits - row.onward) / row.visits), first: "asc" },
  onward: { value: (row) => (row.onward == null || row.visits === 0 ? null : row.onward / row.visits), first: "desc" },
  next: { value: (row) => row.next?.share ?? null, first: "desc" },
  leftVisits: { value: (row) => (row.onward == null ? null : row.visits - row.onward), first: "desc" }, onwardVisits: { value: (row) => row.onward ?? null, first: "desc" },
};
/** The order a list opens in (GA26): All pages by views, Landing pages and page groups by visits, the channels by value. */
export function openingSort(list: ListKind): keyof typeof LIST_SORTS {
  return list === "page" ? "views" : list === "landing" || list === "groups" || list === "campaign" || list === "adKeyword" || isVisitorList(list) ? "visits" : "value";
}

export const sortValidator = v.union(...(Object.keys(LIST_SORTS) as (keyof typeof LIST_SORTS)[]).map((key) => v.literal(key)));

// ---------------------------------------------------------------------------
// The lists
// ---------------------------------------------------------------------------

export const listKindValidator = v.union(
  /** Each channel, the assistants folded into AI assistants (§4.4). */
  v.literal("channel"),
  /** One channel's sources; AI assistants' by assistant (GA22). */
  v.literal("source"),
  v.literal("landing"),
  /** The landing pages added up into the website's page groups (GA15). */
  v.literal("groups"),
  v.literal("page"),
  /** Visits from tagged links, by campaign and where the link was; and by the words a link carries (§18.6.6). */
  v.literal("campaign"),
  v.literal("adKeyword"),
  /** Visitors (§18.6.6): new or returning, browsers, operating systems, age, gender, interests. */
  ...VISITOR_LISTS.map((list) => v.literal(list)),
);
export type ListKind = Infer<typeof listKindValidator>;

export function isVisitorList(list: ListKind): list is VisitorList {
  return (VISITOR_LISTS as readonly string[]).includes(list);
}
