import { v, type Infer, type ObjectType } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { decodePages } from "./holdPageRefs";
import { titlesOf } from "./pageTitles";
import { readPageKinds } from "./pageKinds";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { connectionOf, conversionsOf, countedOf, readSlot, type ShownRow } from "./googleAnalyticsRows";
import { readAnalyticsList, type ListAnswer } from "./googleAnalyticsReads";
import { readEvents } from "./googleAnalyticsEventReads";
import { productList } from "./googleAnalyticsProductReads";
import { UNKNOWN_GROUP } from "./googleAnalyticsConversionReads";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { isUnknownValue } from "./utils/analyticsUnknown";

/**
 * Overview's panels (docs/plans/active/ga-overview-plan.md OV2–OV7): each
 * kind of data Hakken keeps from Google Analytics, its first rows, from the
 * lists the night's run keeps — never asked of Google (ga-stored-figures-plan.md
 * SF1). Tracking health's panel (OV8) reads the checks the connection already
 * holds, on the screen. Ask Hakken reads the same (SF16).
 */

/** The rows each panel shows (OV9); Who visited shows one a kind. */
export const OVERVIEW_TOP = 3;

/** Who visited's kinds, in the panel's order (OV6). */
export const WHO_KINDS = ["visitorType", "device", "age", "gender", "interest", "browser", "system"] as const;
type WhoKind = (typeof WHO_KINDS)[number];
const WHO_LISTS = ["visitorType", "age", "gender", "interest", "browser", "system"] as const;
const DEVICES = ["desktop", "mobile", "tablet"] as const;
/** Landing pages named beyond the three: Google's rows for no page recorded, passed over. */
const PASSED_OVER = 3;

const topRowValidator = v.object({
  key: v.string(),
  /** A channel's name, a page's address, or a classification's id. */
  label: v.string(),
  /** The classification's name — of a classification row, or of a landing page's; null for Unclassified. */
  kindName: v.optional(v.union(v.string(), v.null())),
  /** A page's title (GA27). */
  title: v.optional(v.string()),
  visits: v.number(),
  /** Visits against the span before, as a fraction; null with none to compare. */
  change: v.union(v.number(), v.null()),
  /** The share of the visits that left from the page they landed on: pages and classifications only. */
  left: v.optional(v.union(v.number(), v.null())),
  conversions: v.number(),
  value: v.number(),
});
type TopRow = Infer<typeof topRowValidator>;

const eventRowValidator = v.object({
  eventName: v.string(),
  /** Counted and happened; a key event not counted; counted but never happened. */
  status: v.union(v.literal("counted"), v.literal("uncounted"), v.literal("never")),
  times: v.number(),
  /** Counted ones only, in hundredths. */
  value: v.union(v.number(), v.null()),
  change: v.union(v.number(), v.null()),
});

const whoRowValidator = v.object({
  kind: v.union(...WHO_KINDS.map((kind) => v.literal(kind))),
  /** The biggest group Google named: "new", "desktop", "25-34", "Chrome". */
  label: v.string(),
  /** Its share of the visits, now and in the span before (null with none to compare). */
  share: v.number(),
  shareBefore: v.union(v.number(), v.null()),
});

const productRowValidator = v.object({
  key: v.string(),
  name: v.string(),
  looks: v.number(),
  basket: v.number(),
  bought: v.number(),
  revenue: v.number(),
});

/**
 * Overview's panels come in two reads (calendar-periods audit, 2026-10-21): a big website's year of landing pages, read
 * now and before with every address, took the one read past Convex's second on its own. The page panels are one read,
 * the rest another, and the screen and Ask Hakken put them together.
 */
export const overviewPanelsValidator = v.object({
  channels: v.object({
    rows: v.array(topRowValidator),
    count: v.number(),
    /** Visits from tagged links and from ad keywords; null before their lists are held. */
    tagged: v.union(v.number(), v.null()),
    keywords: v.union(v.number(), v.null()),
  }),
  conversions: v.object({ rows: v.array(eventRowValidator), count: v.number() }),
  who: v.array(whoRowValidator),
  /** Null unless the website sells. */
  shop: v.union(v.null(), v.object({
    rows: v.array(productRowValidator),
    count: v.number(),
    basket: v.number(),
    bought: v.number(),
    revenue: v.number(),
  })),
});

/** The page panels: the classifications and the landing pages, from one read of the landing pages. */
export const overviewPagePanelsValidator = v.object({
  /** Null when the website's pages have no classifications. */
  kinds: v.union(v.null(), v.object({ rows: v.array(topRowValidator), count: v.number() })),
  landing: v.object({
    rows: v.array(topRowValidator),
    count: v.number(),
    /** The share of every visit that left from the page it landed on. */
    left: v.union(v.number(), v.null()),
  }),
});
export type OverviewPanels = Infer<typeof overviewPanelsValidator> & Infer<typeof overviewPagePanelsValidator>;

const overviewPanelsArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };
type PanelArgs = ObjectType<typeof overviewPanelsArgs>;

export const analyticsOverviewPanels = tenantQuery({
  args: overviewPanelsArgs,
  returns: v.union(v.null(), overviewPanelsValidator),
  handler: async (ctx, args) => await readOverviewPanels(ctx, args),
});

export const analyticsOverviewPagePanels = tenantQuery({
  args: overviewPanelsArgs,
  returns: v.union(v.null(), overviewPagePanelsValidator),
  handler: async (ctx, args) => await readOverviewPagePanels(ctx, args),
});

/** The most visits first, then by name: the panels' order. */
const byVisits = (left: ShownRow, right: ShownRow) => right.visits - left.visits || left.label.localeCompare(right.label);

/** The share who left from the page they landed on: what did not go on (Funnel's `onward`). */
const leftOf = (row: ShownRow) => (row.visits > 0 && row.onward !== undefined && row.onward !== null ? Math.max(0, row.visits - row.onward) / row.visits : null);

/** The visits a held list counts, or null before it is held. */
const visitsIn = (answer: ListAnswer) => (answer.live || answer.preparing ? null : answer.rows.reduce((sum, row) => sum + row.visits, 0));

/** Overview's panels but the page panels, for the dates, device and home country chosen: null before the first collection. */
export async function readOverviewPanels(ctx: SiteReader, args: PanelArgs): Promise<Infer<typeof overviewPanelsValidator> | null> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const listArgs = { period: args.period, device: args.device, country };

  // OV2: the channels, and the visits from tagged links and ad keywords.
  const channels = await readAnalyticsList(ctx, holdId, { ...listArgs, list: "channel" });
  const campaigns = await readAnalyticsList(ctx, holdId, { ...listArgs, list: "campaign" });
  const keywords = await readAnalyticsList(ctx, holdId, { ...listArgs, list: "adKeyword" });
  const channelRows = [...channels.every].sort(byVisits);

  return {
    channels: {
      rows: channelRows.slice(0, OVERVIEW_TOP).map((row) => topRow(row)),
      count: channelRows.length,
      tagged: visitsIn(campaigns),
      keywords: visitsIn(keywords),
    },
    conversions: await conversionsPanel(ctx, args, holdId, country),
    who: await whoVisited(ctx, holdId, listArgs),
    shop: connection.shop === true ? shopPanel(await productList(ctx, site.hold, listArgs)) : null,
  };
}

/** Overview's page panels (OV3, OV4): null before the first collection. */
export async function readOverviewPagePanels(ctx: SiteReader, args: PanelArgs): Promise<Infer<typeof overviewPagePanelsValidator> | null> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const listArgs = { period: args.period, device: args.device, country };

  // OV3: the classifications, with what left from their landing pages — and the landing pages from the same read.
  const kinds = await readPageKinds(ctx, holdId);
  const groups = kinds ? await readAnalyticsList(ctx, holdId, { ...listArgs, list: "groups", pages: true }) : null;
  const groupRows = groups ? [...groups.every].sort(byVisits) : [];

  // OV4: the landing pages, each with its classification; no page recorded left out of the three. Without
  // classifications they are read on their own, named only as far as the three need: a few more for the visits with no
  // page recorded passed over.
  const pages = [...(groups?.pages ?? (await readAnalyticsList(ctx, holdId, { ...listArgs, list: "landing" })).every)].sort(byVisits);
  const first = pages.slice(0, OVERVIEW_TOP + PASSED_OVER);
  const addresses = groups?.pages ? first.map((row) => row.label) : await decodePages(ctx, holdId, first.map((row) => row.key));
  const named = first.map((row, at) => ({ row, address: addresses[at] })).filter(({ address }) => address !== "" && !isUnknownValue(address));
  const top = named.slice(0, OVERVIEW_TOP);
  const titles = await titlesOf(ctx, holdId, top.map(({ address }) => address));
  const landed = pages.reduce((sum, row) => sum + row.visits, 0);
  const stayed = pages.reduce((sum, row) => sum + (row.onward ?? 0), 0);

  return {
    kinds: kinds && groups ? {
      rows: groupRows.slice(0, OVERVIEW_TOP).map((row) => topRow(row, { kindName: row.key === NOT_SORTED_KIND ? null : kinds.nameOf(row.key), left: leftOf(row) })),
      count: groupRows.length,
    } : null,
    landing: {
      rows: top.map(({ row, address }) => {
        const title = titles.get(address);
        return topRow(row, {
          label: address,
          ...(kinds ? { kindName: kinds.nameOf(kinds.kindOf(address)) } : {}),
          ...(title ? { title } : {}),
          left: leftOf(row),
        });
      }),
      count: pages.length,
      left: landed > 0 && pages.some((row) => row.onward !== undefined) ? Math.max(0, landed - stayed) / landed : null,
    },
  };
}

function topRow(row: ShownRow, extra: Partial<TopRow> = {}): TopRow {
  return { key: row.key, label: row.label, visits: row.visits, change: row.change, conversions: row.conversions, value: row.value, ...extra };
}

const STATUS_ORDER = { counted: 0, uncounted: 1, never: 2 } as const;

/** OV5: each counted conversion and key event not counted, those that happened first; each counted one's value from the totals. */
async function conversionsPanel(ctx: SiteReader, args: PanelArgs, holdId: Id<"companyWebsites">, country: string) {
  const events = await readEvents(ctx, args);
  const connection = await connectionOf(ctx, holdId);
  const counted = connection ? countedOf(connection) : [];
  const total = (await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country)))?.rows[0] ?? null;
  const rows = (events?.rows ?? [])
    .filter((row) => row.counted || row.keyEvent)
    .map((row) => {
      const status = !row.counted ? "uncounted" as const : row.times > 0 ? "counted" as const : "never" as const;
      const own = counted.filter((event) => event.eventName === row.eventName);
      return {
        eventName: row.eventName,
        status,
        times: row.times,
        value: row.counted && total ? conversionsOf(total, own).value : null,
        change: row.timesBefore ? (row.times - row.timesBefore) / row.timesBefore : null,
      };
    })
    .sort((left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || right.times - left.times || left.eventName.localeCompare(right.eventName));
  return { rows: rows.slice(0, OVERVIEW_TOP), count: rows.length };
}

/**
 * OV6: each kind's biggest group Google named, and its share of all the
 * visits now and before — of every visit, never only those Google could name,
 * which for age and gender can be a few. Device only on every device's
 * figures, from the totals kept for each device.
 */
async function whoVisited(ctx: SiteReader, holdId: Id<"companyWebsites">, listArgs: { period: AnalyticsPeriod; device: string; country: string }) {
  const visitsOf = async (which: "NOW" | "BEFORE", device: string) => (await readSlot(ctx, holdId, slotKey("total", listArgs.period, which, device, listArgs.country)))?.rows[0]?.visits ?? null;
  const every = { now: await visitsOf("NOW", listArgs.device), before: await visitsOf("BEFORE", listArgs.device) };
  const rows: Array<Infer<typeof whoRowValidator>> = [];
  const groups = new Map<WhoKind, Omit<Infer<typeof whoRowValidator>, "kind"> | null>();
  for (const list of WHO_LISTS) groups.set(list, biggestOf(await readAnalyticsList(ctx, holdId, { ...listArgs, list }), every));
  if (listArgs.device === "") {
    const devices = await Promise.all(DEVICES.map(async (device) => ({ device, now: await visitsOf("NOW", device) ?? 0, before: await visitsOf("BEFORE", device) })));
    const top = devices.sort((left, right) => right.now - left.now)[0];
    groups.set("device", every.now && top.now > 0 ? { label: top.device, share: top.now / every.now, shareBefore: every.before && top.before !== null ? top.before / every.before : null } : null);
  }
  for (const kind of WHO_KINDS) {
    const row = groups.get(kind);
    if (row) rows.push({ kind, ...row });
  }
  return rows;
}

/** A list's biggest named group and its share of every visit, now and before — its visits before worked back from its change. */
function biggestOf(answer: ListAnswer, every: { now: number | null; before: number | null }): Omit<Infer<typeof whoRowValidator>, "kind"> | null {
  if (answer.live || answer.preparing || !every.now) return null;
  const top = answer.every.filter((row) => row.key !== UNKNOWN_GROUP && row.visits > 0).sort(byVisits)[0];
  if (!top) return null;
  const hadBefore = answer.totals?.before !== null && answer.totals?.before !== undefined;
  const topBefore = !hadBefore ? null : top.change === null ? 0 : Math.round(top.visits / (1 + top.change));
  return { label: top.label, share: top.visits / every.now, shareBefore: every.before && topBefore !== null ? topBefore / every.before : null };
}

/** OV7: the best sellers, and the shop's baskets, sales and revenue added up. */
function shopPanel(list: Awaited<ReturnType<typeof productList>>) {
  const rows = list.rows;
  return {
    rows: rows.slice(0, OVERVIEW_TOP).map((row) => ({ key: row.key, name: row.name, looks: row.looks, basket: row.basket, bought: row.bought, revenue: row.revenue })),
    count: rows.length,
    basket: rows.reduce((sum, row) => sum + row.basket, 0),
    bought: rows.reduce((sum, row) => sum + row.bought, 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
  };
}
