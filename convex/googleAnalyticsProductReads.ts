import { readDayPoints } from "./googleAnalyticsHistory";
import { v, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { SHOP_STEPS, splitChannelKey } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { seenValidator } from "./utils/hakkenSees";
import { productsSees, type ShopSteps } from "./utils/sees/analyticsProducts";
import { connectionOf, readFor, readSlot, type Held } from "./googleAnalyticsRows";

/**
 * What Products reads (docs/plans/active/google-analytics-plan.md GA34,
 * §18.2 board 25, §18.6.6): the shop's four steps from the events list and
 * its revenue, against the span before — the visits that reached each step
 * too, and a day at a time, for the baskets and checkouts left
 * (docs/plans/active/shop-baskets-plan.md); the products bought a day; and each
 * product's looks, baskets, sales and revenue, searched, filtered by
 * category, sorted and paged on the server. Only for a shop; each device's
 * lists kept by each collection. Only the caller's own
 * website (`requireMySite`).
 */

type Reader = { db: QueryCtx["db"] };

const heldOf = (list: Held | "LIVE" | null) => (list && list !== "LIVE" ? list : null);

/** The lists Products reads besides the totals, each a device's built by the next run. */
const NEEDED = ["event", "product"] as const;

const shopStepsValidator = v.object({ looked: v.number(), basket: v.number(), checkout: v.number(), bought: v.number() });
const stepsValidator = v.object({
  looked: v.number(), basket: v.number(), checkout: v.number(), bought: v.number(), revenue: v.number(),
  /** The visits that reached each step: shoppers, not times (shop-baskets-plan.md; Anthony, 2026-10-21). */
  visits: shopStepsValidator,
});

/** Each step's event, in the events list. */
const STEP_EVENTS: Record<keyof ShopSteps, (typeof SHOP_STEPS)[number]> = { looked: "view_item", basket: "add_to_cart", checkout: "begin_checkout", bought: "purchase" };

/** The shop's four steps from an events list, as many times as each happened and as many visits as reached it, and the revenue from the totals. */
function stepsOf(events: Held | null, total: Held | null): (ShopSteps & { revenue: number; visits: ShopSteps }) | null {
  if (!events) return null;
  const row = (step: keyof ShopSteps) => events.rows.find((one) => one.key === STEP_EVENTS[step]);
  const of = (figure: (step: keyof ShopSteps) => number): ShopSteps => ({ looked: figure("looked"), basket: figure("basket"), checkout: figure("checkout"), bought: figure("bought") });
  return { ...of((step) => row(step)?.times ?? 0), revenue: total?.rows[0]?.revenue ?? 0, visits: of((step) => row(step)?.visits ?? 0) };
}

/** One product as the screen shows it. */
const productRowValidator = v.object({
  key: v.string(),
  name: v.string(),
  category: v.string(),
  looks: v.number(),
  basket: v.number(),
  bought: v.number(),
  /** In hundredths of the property's currency. */
  revenue: v.number(),
  /** Revenue against the span before, as a fraction; null when there is none to compare. */
  change: v.union(v.number(), v.null()),
});
type ProductRow = typeof productRowValidator.type;

/** The products held for the dates, device and home country chosen, each against the span before. */
async function productsOf(ctx: Reader, holdId: Id<"companyWebsites">, args: { period: AnalyticsPeriod; device: string }, country: string) {
  const nowList = await readFor(ctx, holdId, "product", args.period, "NOW", args.device, undefined, country);
  const before = heldOf(await readFor(ctx, holdId, "product", args.period, "BEFORE", args.device, undefined, country));
  const now = heldOf(nowList);
  const was = new Map((before?.rows ?? []).map((row) => [row.key, row.revenue]));
  const rows: ProductRow[] = (now?.rows ?? []).map((row) => {
    const { channel: name, source: category } = splitChannelKey(row.key);
    const earlier = was.get(row.key) ?? 0;
    return {
      key: row.key, name, category, looks: row.views, basket: row.basket ?? 0, bought: row.purchases, revenue: row.revenue,
      change: before && earlier > 0 ? (row.revenue - earlier) / earlier : null,
    };
  });
  return { rows, live: nowList === "LIVE", preparing: nowList === null };
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

/**
 * Products above its table (§18.2 board 25): the shop's four steps and its
 * revenue against the span before, the products bought a day, the categories
 * for the filter, and What Hakken sees over all of it.
 */
export const analyticsProducts = tenantQuery({
  args: analyticsProductsArgs,
  returns: v.union(v.null(), v.object({
    shop: v.boolean(),
    preparing: v.boolean(),
    /** One device's lists still to ask of Google. */
    missing: v.array(v.union(...NEEDED.map((list) => v.literal(list)))),
    steps: v.union(v.null(), stepsValidator),
    before: v.union(v.null(), stepsValidator),
    points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), bought: v.number() })),
    /** The visits that added to the basket, started checkout and bought, a day (then a week, then a month), from the events' days kept. */
    shoppers: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), basket: v.number(), checkout: v.number(), bought: v.number() })),
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
  const none = { shop: false, preparing: false, missing: [], steps: null, before: null, points: [], shoppers: [], categories: [], seen: { says: [], steps: [] } };
  if (!isShop(connection)) return none;
  const eventsList = await readFor(ctx, holdId, "event", args.period, "NOW", args.device, undefined, country);
  const eventsBefore = heldOf(await readFor(ctx, holdId, "event", args.period, "BEFORE", args.device, undefined, country));
  // The products bought stored a day, then a week, then a month (SF12).
  const every = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
  const stored = every ? await readDayPoints(ctx, connection, "product", args.device, every.from, every.to, country) : null;
  // The visits at each step the same way, from the events' days (shop-baskets-plan.md): none until those are kept.
  const eventDays = every ? await readDayPoints(ctx, connection, "event", args.device, every.from, every.to, country) : null;
  const products = await productsOf(ctx, holdId, args, country);
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const totalBefore = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device, country));
  const missing = [
    ...(eventsList === "LIVE" ? ["event" as const] : []),
    ...(products.live ? ["product" as const] : []),
  ];
  const steps = stepsOf(heldOf(eventsList), total);
  const points: Array<{ day: string; lastDay?: string; bought: number }> = (stored ?? []).map((point) => ({
    day: point.start,
    ...(point.end !== point.start ? { lastDay: point.end } : {}),
    bought: point.rows.reduce((sum, row) => sum + row.purchases, 0),
  }));
  const shoppers = (eventDays ?? []).map((point) => {
    const visits = (step: keyof ShopSteps) => point.rows.filter((row) => row.key === STEP_EVENTS[step]).reduce((sum, row) => sum + row.visits, 0);
    return { day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), basket: visits("basket"), checkout: visits("checkout"), bought: visits("bought") };
  });
  const before = stepsOf(eventsBefore, totalBefore);
  return {
    shop: true,
    preparing: products.preparing,
    missing,
    steps,
    before,
    points,
    shoppers,
    categories: [...new Set(products.rows.map((row) => row.category).filter((category) => category && !/^\(.*\)$/.test(category)))].sort(),
    seen: steps && missing.length === 0 && !products.preparing
      ? productsSees(steps.visits, products.rows.map((row) => ({ name: row.name, looks: row.looks, bought: row.bought, revenue: row.revenue })), before?.visits ?? null)
      : { says: [], steps: [] },
  };
}

const SORTS: ListSorts<ProductRow, "name" | "looks" | "basket" | "bought" | "revenue" | "change"> = {
name: { value: (row) => row.name, first: "asc" },
looks: { value: (row) => row.looks, first: "desc" },
basket: { value: (row) => row.basket, first: "desc" },
bought: { value: (row) => row.bought, first: "desc" },
revenue: { value: (row) => row.revenue, first: "desc" },
change: { value: (row) => row.change, first: "desc" },
};

const listArgs = {
  ...filterArgs,
  /** Only one category's products. */
  category: v.optional(v.string()),
  q: v.optional(v.string()),
  sort: v.optional(v.union(...(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => v.literal(key)))),
  direction: sortDirectionArg,
};

type ListArgs = {
  period: AnalyticsPeriod; device: string; country?: string; category?: string; q?: string;
  sort?: keyof typeof SORTS; direction?: "asc" | "desc";
};

/** Every product the filters leave, searched and in the order asked: the best seller first unless told otherwise. */
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

/** One page of the products, counted exactly. */
export const analyticsProductList = tenantQuery({
  args: { ...listArgs, ...listPageArgs },
  returns: v.object({
    rows: v.array(productRowValidator),
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
    const list = await productList(ctx, site.hold, args);
    return { ...pageOfList(list.rows, args.page, args.rows), cut: null, live: list.live, preparing: list.preparing };
  },
});

/** Every product, in the order on screen: its download. */
export const analyticsProductListAll = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(productRowValidator) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return { rows: (await productList(ctx, site.hold, args)).rows };
  },
});
