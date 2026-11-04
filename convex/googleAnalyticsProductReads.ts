import { v, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { splitChannelKey } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { seenValidator } from "./utils/hakkenSees";
import { productsSees } from "./utils/sees/analyticsProducts";
import { connectionOf, readFor, type Held } from "./googleAnalyticsRows";
import { decodePages } from "./holdPageRefs";
import { AUTOMATIC_EVENTS, shopChoiceOf } from "./googleAnalyticsShopSteps";

/**
 * What Products reads (docs/plans/active/products-screen-4-plan-2026-11-02.md, phase 2; drawn as board 4 of the
 * canvas "Products page, three ways"). No money anywhere, because not every Google Analytics account records revenue
 * (Anthony, 2026-11-02): visits and items only.
 *
 * - **The page** (`analyticsProducts`): the shop's own events for the Steps dropdown, the steps and sale it picked
 *   (`shopChoiceOf`), each step's visits and how many ended with the sale, and the products added and never bought.
 * - **The products chart** (`analyticsProductChart`): ten products for each of its four views, picked from the whole
 *   list: most left in baskets, most bought, and the biggest rise and fall in items bought against the period before.
 * - **The table** (`analyticsProductList`): each product or category's items bought, its share and its items added,
 *   searched, filtered, sorted and paged on the server.
 *
 * Nothing is asked of Google: each collection already keeps the events list and the product list for every period and
 * the period before. Only a shop; only the caller's own website (`requireMySite`).
 */

type Reader = { db: QueryCtx["db"] };

const heldOf = (list: Held | "LIVE" | null) => (list && list !== "LIVE" ? list : null);

/** The lists Products reads, each a device's built by the next run. */
const NEEDED = ["event", "product"] as const;

/** A product as the product list holds it, money and looks kept for Overview's shop panel (OV7). */
type ProductRow = {
  key: string;
  name: string;
  category: string;
  looks: number;
  basket: number;
  bought: number;
  /** In hundredths of the property's currency. Overview's only: Products shows no money. */
  revenue: number;
  /** Revenue against the span before, as a fraction; null when there is none to compare. */
  change: number | null;
  /** Items bought the period before; null when nothing is held for it. */
  boughtBefore: number | null;
};

/** The products held for the dates, device and home country chosen, each beside the period before; a page's own screen reads them too. */
export async function productsOf(ctx: Reader, holdId: Id<"companyWebsites">, args: { period: AnalyticsPeriod; device: string }, country: string) {
  // Its items alone, no key events: a product's row carries a column of each, all nought, and a page's boxes read this
  // beside a year's landing pages (2026-11-04: the two read whole ran them out of their 64MB on More Handles).
  const items = { events: new Set<string>() };
  const nowList = await readFor(ctx, holdId, "product", args.period, "NOW", args.device, undefined, country, items);
  const before = heldOf(await readFor(ctx, holdId, "product", args.period, "BEFORE", args.device, undefined, country, items));
  const now = heldOf(nowList);
  const was = new Map((before?.rows ?? []).map((row) => [row.key, row]));
  const row = (held: Held["rows"][number], earlier: Held["rows"][number] | undefined, gone = false): ProductRow => {
    const { channel: name, source: category } = splitChannelKey(held.key);
    return {
      key: held.key, name, category,
      looks: gone ? 0 : held.views, basket: gone ? 0 : held.basket ?? 0, bought: gone ? 0 : held.purchases, revenue: gone ? 0 : held.revenue,
      change: before && earlier && earlier.revenue > 0 ? ((gone ? 0 : held.revenue) - earlier.revenue) / earlier.revenue : null,
      boughtBefore: before ? earlier?.purchases ?? 0 : null,
    };
  };
  const rows = (now?.rows ?? []).map((held) => row(held, was.get(held.key)));
  const kept = new Set(rows.map((one) => one.key));
  // Bought the period before and nothing now: selling less, to none. Never in the table, which lists the dates' own.
  const gone = (before?.rows ?? []).filter((held) => held.purchases > 0 && !kept.has(held.key)).map((held) => row(held, held, true));
  const neverBoughtBefore = before ? before.rows.filter((held) => (held.basket ?? 0) > 0 && held.purchases === 0).length : null;
  return { rows, gone, neverBoughtBefore, live: nowList === "LIVE", preparing: nowList === null };
}

/** Whether the website's connection is a shop's: Products shows nothing else. */
const isShop = (connection: Doc<"googleAnalyticsConnections"> | null) => connection?.shop === true;

const filterArgs = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  country: v.optional(v.string()),
};

const analyticsProductsArgs = filterArgs;

/** A product, or a category, as Products shows it: items, never money. */
const shownValidator = v.object({
  key: v.string(),
  name: v.string(),
  category: v.string(),
  itemsBought: v.number(),
  itemsAdded: v.number(),
  /** Items put in a basket and not bought: added less bought. */
  itemsLeft: v.number(),
  /** Items bought the period before; null when nothing is held for it. */
  itemsBoughtBefore: v.union(v.number(), v.null()),
  /** Its share of every item bought in the dates, 0–1. */
  share: v.number(),
});
type Shown = typeof shownValidator.type;

const shownOf = (row: ProductRow, total: number): Shown => ({
  key: row.key, name: row.name, category: row.category,
  itemsBought: row.bought, itemsAdded: row.basket, itemsLeft: Math.max(0, row.basket - row.bought),
  itemsBoughtBefore: row.boughtBefore,
  share: total > 0 ? row.bought / total : 0,
});

const itemsBoughtIn = (rows: readonly ProductRow[]) => rows.reduce((sum, row) => sum + row.bought, 0);

/** An event's visits, and the period before's when held. */
const eventFigureValidator = v.object({ eventName: v.string(), visits: v.number(), visitsBefore: v.union(v.number(), v.null()) });

/** Products above its table: the steps, the sale, the boxes' figures and What Hakken sees. */
export const analyticsProducts = tenantQuery({
  args: analyticsProductsArgs,
  returns: v.union(v.null(), v.object({
    shop: v.boolean(),
    preparing: v.boolean(),
    /** One device's lists still to ask of Google. */
    missing: v.array(v.union(...NEEDED.map((list) => v.literal(list)))),
    /** Every event recorded in the dates, most visits first, Google's automatic ones left out: the Steps dropdown. */
    events: v.array(eventFigureValidator),
    /** The steps and sale the company picked, or Google's own names until it does. */
    choice: v.object({ steps: v.array(v.string()), sale: v.union(v.string(), v.null()), saved: v.boolean() }),
    /** Bought or left behind: each step's visits, most first, and the sale's. */
    journey: v.object({ steps: v.array(eventFigureValidator), sale: v.union(v.null(), eventFigureValidator) }),
    /** Products put in a basket and none bought: how many, of how many added, and the period before's. */
    neverBought: v.object({ count: v.number(), of: v.number(), countBefore: v.union(v.number(), v.null()) }),
    categories: v.array(v.string()),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => await readProducts(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readProducts(ctx: SiteReader, args: ObjectType<typeof analyticsProductsArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const none = {
    shop: false, preparing: false, missing: [], events: [], choice: { steps: [], sale: null, saved: false },
    journey: { steps: [], sale: null }, neverBought: { count: 0, of: 0, countBefore: null }, categories: [], seen: { says: [], steps: [] },
  };
  if (!isShop(connection)) return none;
  const eventsList = await readFor(ctx, holdId, "event", args.period, "NOW", args.device, undefined, country);
  const eventsBefore = heldOf(await readFor(ctx, holdId, "event", args.period, "BEFORE", args.device, undefined, country));
  const products = await productsOf(ctx, holdId, args, country);
  const missing = [
    ...(eventsList === "LIVE" ? ["event" as const] : []),
    ...(products.live ? ["product" as const] : []),
  ];
  const was = new Map((eventsBefore?.rows ?? []).map((row) => [row.key, row.visits]));
  const figureOf = (eventName: string, visits: number) => ({ eventName, visits, visitsBefore: eventsBefore ? was.get(eventName) ?? 0 : null });
  const recorded = (heldOf(eventsList)?.rows ?? []).filter((row) => row.visits > 0 && !AUTOMATIC_EVENTS.has(row.key));
  const events = recorded.map((row) => figureOf(row.key, row.visits)).sort((left, right) => right.visits - left.visits || left.eventName.localeCompare(right.eventName));
  const visitsOf = new Map(events.map((event) => [event.eventName, event.visits]));
  const choice = shopChoiceOf(connection, new Set(visitsOf.keys()));
  const journey = {
    // The funnel's order is its own: the step most visits reached first.
    steps: choice.steps.map((step) => figureOf(step, visitsOf.get(step) ?? 0)).sort((left, right) => right.visits - left.visits),
    sale: choice.sale === null ? null : figureOf(choice.sale, visitsOf.get(choice.sale) ?? 0),
  };
  const neverBought = {
    count: products.rows.filter((row) => row.basket > 0 && row.bought === 0).length,
    of: products.rows.filter((row) => row.basket > 0).length,
    countBefore: products.neverBoughtBefore,
  };
  const total = itemsBoughtIn(products.rows);
  return {
    shop: true,
    preparing: products.preparing,
    missing,
    events,
    choice,
    journey,
    neverBought,
    categories: categoriesOf(products.rows),
    seen: missing.length === 0 && !products.preparing
      ? productsSees(journey, products.rows.map((row) => shownOf(row, total)))
      : { says: [], steps: [] },
  };
}

/** The shop's own categories, named; Google's "(not set)" and the like left out. */
function categoriesOf(rows: readonly ProductRow[]): string[] {
  return [...new Set(rows.map((row) => row.category).filter((category) => category && !/^\(.*\)$/.test(category)))].sort();
}

// ---------------------------------------------------------------------------
// The products chart
// ---------------------------------------------------------------------------

/** Each view's bars: ten products, picked from the whole list. */
const CHART_ROWS = 10;

const chartArgs = { ...filterArgs, category: v.optional(v.string()) };

/** The products chart's four views (board "The products chart, ready to reuse"), for one category or all. */
export const analyticsProductChart = tenantQuery({
  args: chartArgs,
  returns: v.object({
    left: v.array(shownValidator),
    sold: v.array(shownValidator),
    more: v.array(shownValidator),
    less: v.array(shownValidator),
    /** Whether the period before is held: without it, Selling more and Selling less have nothing to compare. */
    compared: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return await productChart(ctx, site.hold, args);
  },
});

export async function productChart(ctx: Reader, hold: Doc<"companyWebsites">, args: Omit<ObjectType<typeof chartArgs>, "siteId"> & { siteId?: Id<"companyWebsites"> }) {
  const empty = { left: [], sold: [], more: [], less: [], compared: false };
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, hold._id);
  if (!connection?.newestDay || !isShop(connection)) return empty;
  const products = await productsOf(ctx, hold._id, args, country);
  const total = itemsBoughtIn(products.rows);
  const inCategory = (row: ProductRow) => args.category === undefined || row.category === args.category;
  const now = products.rows.filter(inCategory).map((row) => shownOf(row, total));
  const gone = products.gone.filter(inCategory).map((row) => shownOf(row, total));
  const top = (rows: readonly Shown[], figure: (row: Shown) => number) => rows
    .filter((row) => figure(row) > 0)
    .sort((left, right) => figure(right) - figure(left) || left.name.localeCompare(right.name))
    .slice(0, CHART_ROWS);
  const moved = (row: Shown) => row.itemsBought - (row.itemsBoughtBefore ?? row.itemsBought);
  const compared = now.some((row) => row.itemsBoughtBefore !== null) || gone.length > 0;
  return {
    left: top(now, (row) => row.itemsLeft),
    sold: top(now, (row) => row.itemsBought),
    more: compared ? top(now, moved) : [],
    less: compared ? top([...now, ...gone], (row) => -moved(row)) : [],
    compared,
  };
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const SHOWN_SORTS: ListSorts<Shown, "name" | "itemsBought" | "share" | "itemsAdded"> = {
  name: { value: (row) => row.name, first: "asc" },
  itemsBought: { value: (row) => row.itemsBought, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  itemsAdded: { value: (row) => row.itemsAdded, first: "desc" },
};

const listArgs = {
  ...filterArgs,
  /** Products, or the shop's categories added up. */
  view: v.optional(v.union(v.literal("products"), v.literal("categories"))),
  /** Every product, those that sold, or those added and never bought. */
  show: v.optional(v.union(v.literal("all"), v.literal("selling"), v.literal("notBought"))),
  /** Only one category's products. */
  category: v.optional(v.string()),
  q: v.optional(v.string()),
  sort: v.optional(v.union(...(Object.keys(SHOWN_SORTS) as (keyof typeof SHOWN_SORTS)[]).map((key) => v.literal(key)))),
  direction: sortDirectionArg,
};

/** Every product or category the filters leave, searched and in the order asked: the most bought first unless told otherwise. */
export async function shownProductList(ctx: Reader, hold: Doc<"companyWebsites">, args: Omit<ObjectType<typeof listArgs>, "siteId"> & { siteId?: Id<"companyWebsites"> }) {
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, hold._id);
  if (!connection?.newestDay || !isShop(connection)) return { rows: [] as Shown[], live: false, preparing: false };
  const products = await productsOf(ctx, hold._id, args, country);
  const total = itemsBoughtIn(products.rows);
  const matches = wordStartMatcher(args.q);
  const show = args.show ?? "all";
  const kept = products.rows.filter((row) => (args.category === undefined || row.category === args.category)
    && (show === "all" || (show === "selling" ? row.bought > 0 : row.basket > 0 && row.bought === 0)));
  const shown = args.view === "categories" ? categoriesAddedUp(kept, total) : kept.map((row) => shownOf(row, total));
  const rows = shown
    .filter((row) => !matches || matches(row.name))
    .sort(listOrder(SHOWN_SORTS, args.sort ?? "itemsBought", args.direction, (row) => row.name));
  return { rows, live: products.live, preparing: products.preparing };
}

/** The products added up by category, each a row of its own. */
function categoriesAddedUp(rows: readonly ProductRow[], total: number): Shown[] {
  const byCategory = new Map<string, Shown>();
  for (const row of rows) {
    const name = row.category && !/^\(.*\)$/.test(row.category) ? row.category : "(not set)";
    const held = byCategory.get(name) ?? { key: name, name, category: "", itemsBought: 0, itemsAdded: 0, itemsLeft: 0, itemsBoughtBefore: row.boughtBefore === null ? null : 0, share: 0 };
    held.itemsBought += row.bought;
    held.itemsAdded += row.basket;
    held.itemsLeft += Math.max(0, row.basket - row.bought);
    if (held.itemsBoughtBefore !== null) held.itemsBoughtBefore += row.boughtBefore ?? 0;
    held.share = total > 0 ? held.itemsBought / total : 0;
    byCategory.set(name, held);
  }
  return [...byCategory.values()];
}

/** One page of the products or categories, counted exactly. */
export const analyticsProductList = tenantQuery({
  args: { ...listArgs, ...listPageArgs },
  returns: v.object({
    rows: v.array(shownValidator),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    live: v.boolean(),
    preparing: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { page, rows: size, ...filters } = args;
    const list = await shownProductList(ctx, site.hold, filters);
    return { ...pageOfList(list.rows, page, size), cut: null, live: list.live, preparing: list.preparing };
  },
});

/** Every product or category, in the order on screen: its download. */
export const analyticsProductListAll = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(shownValidator) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return { rows: (await shownProductList(ctx, site.hold, args)).rows };
  },
});

// ---------------------------------------------------------------------------
// A product's own page
// ---------------------------------------------------------------------------

/** A page's address matched to a product only when this share of its words are the product's, and at least this many. */
const PAGE_WORDS_SHARE = 0.75;
const PAGE_WORDS_LEAST = 3;

/** A name or an address in plain lower-case words: "Zoo Hardware 4\" Hinge – Pair" and "/zoo-hardware-4-hinge-pair.html" alike. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/\.(?:html?|php|aspx?)$/, "").split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/**
 * The page a product is sold on, for a click on its row (products-screen-4-plan-2026-11-02.md; Anthony, 2026-11-02:
 * "click through and click back"). Google never says which page a product is on, so it is the page viewed in the
 * dates whose address is most nearly the product's own name — a shop's addresses are its products' names
 * (/zoo-hardware-top-drawer-fittings-round-cupboard-knob.html) — the product's sizes and finishes sharing one page.
 * Null when no address is near enough; the screen then searches All pages for the name. Read only when a row is
 * clicked, never with the table.
 */
export function bestPageFor(name: string, pages: ReadonlyArray<{ key: string; address: string; views: number }>): string | null {
  const named = new Set(wordsOf(name));
  let best: { key: string; share: number; covered: number; views: number } | null = null;
  for (const page of pages) {
    const near = nearness(named, page.address);
    if (!near) continue;
    const { share, matched } = near;
    const covered = matched / named.size;
    if (!best || share > best.share || (share === best.share && (covered > best.covered || (covered === best.covered && page.views > best.views)))) {
      best = { key: page.key, share, covered, views: page.views };
    }
  }
  return best?.key ?? null;
}

/** How nearly an address is a product's name: its last part's words that are the name's, when near enough to match. */
function nearness(named: ReadonlySet<string>, address: string): { matched: number; share: number } | null {
  const last = address.replace(/^https?:\/\/[^/]+/, "").split("?")[0].split("/").filter(Boolean).pop() ?? "";
  const words = wordsOf(last);
  if (words.length === 0) return null;
  const matched = words.filter((word) => named.has(word)).length;
  const share = matched / words.length;
  return matched < PAGE_WORDS_LEAST || share < PAGE_WORDS_SHARE ? null : { matched, share };
}

/**
 * Whether a product is sold on a page: `bestPageFor` the other way round, for a page's own screen (page-screen-redo-
 * plan-2026-11-03.md, step 1: "Added to basket" and "Bought" on a product's page). The same nearness, so the page a
 * product's row opens is the page whose boxes count it; each size and finish sharing the page's words counts.
 */
export function soldOnPage(name: string, address: string): boolean {
  return nearness(new Set(wordsOf(name)), address) !== null;
}

/** The page a product is sold on, as its own screen's key: one read when a row is clicked. */
export const analyticsProductPage = tenantQuery({
  args: { ...filterArgs, name: v.string() },
  returns: v.union(v.null(), v.object({ key: v.string() })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay || !isShop(connection)) return null;
    const list = heldOf(await readFor(ctx, holdId, "page", args.period, "NOW", args.device, undefined, country));
    if (!list) return null;
    const addresses = await decodePages(ctx, holdId, list.rows.map((row) => row.key));
    const key = bestPageFor(args.name, list.rows.map((row, at) => ({ key: row.key, address: addresses[at] ?? "", views: row.views })));
    return key ? { key } : null;
  },
});

// ---------------------------------------------------------------------------
// Overview's shop panel
// ---------------------------------------------------------------------------

const SORTS: ListSorts<ProductRow, "name" | "looks" | "basket" | "bought" | "revenue" | "change"> = {
  name: { value: (row) => row.name, first: "asc" },
  looks: { value: (row) => row.looks, first: "desc" },
  basket: { value: (row) => row.basket, first: "desc" },
  bought: { value: (row) => row.bought, first: "desc" },
  revenue: { value: (row) => row.revenue, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
};

type ListArgs = {
  period: AnalyticsPeriod; device: string; country?: string; category?: string; q?: string;
  sort?: keyof typeof SORTS; direction?: "asc" | "desc";
};

/** Every product the filters leave, money and looks kept, in the order asked: Overview's shop panel and Ask Hakken's best sellers. */
export async function productList(ctx: Reader, hold: Doc<"companyWebsites">, args: ListArgs) {
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, hold._id);
  if (!connection?.newestDay || !isShop(connection)) return { rows: [] as ProductRow[], live: false, preparing: false };
  const products = await productsOf(ctx, hold._id, args, country);
  const matches = wordStartMatcher(args.q);
  const rows = products.rows
    .filter((row) => (args.category === undefined || row.category === args.category) && (!matches || matches(row.name)))
    .sort(listOrder(SORTS, args.sort ?? "revenue", args.direction, (row) => row.name));
  return { rows, live: products.live, preparing: products.preparing };
}
