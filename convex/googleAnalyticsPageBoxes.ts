import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { decodePages, isPageRef } from "./holdPageRefs";
import { keptCountry } from "./googleAnalyticsCountries";
import { splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { connectionOf, countedOf, readFor } from "./googleAnalyticsRows";
import { landingByChannel } from "./googleAnalyticsChannelReads";
import { AUTOMATIC_EVENTS, shopChoiceOf } from "./googleAnalyticsShopSteps";
import { productsOf, soldOnPage } from "./googleAnalyticsProductReads";
import { landingKeyOf } from "./googleAnalyticsPageNumbers";

/**
 * The figures a page's own screen's boxes add to what `analyticsPage` reads (page-screen-redo-plan-2026-11-03.md,
 * step 1; boards 2 and 3 of the canvas "Hakken — A page's own screen, redo", approved by Anthony on 3 November 2026):
 *
 * - **On a product's page**: the items of every product sold on it (each size and finish whose name its address is
 *   made of, as Products' click-through matches them) added to baskets and bought, against the period before, and
 *   the items the whole website sold. Items, never money (not every account records revenue).
 * - **On any page**: the visits that started on it and went on to the sale (a shop's chosen sale, or its main
 *   conversion elsewhere) — visits, never Google's count of times, so never more than the visits — against the whole
 *   website's share.
 *
 * Read from what each collection keeps; nothing is asked of Google. Only the caller's own website.
 */

const productValidator = v.object({
  /** How many of the shop's products are sold on the page: its sizes and finishes. */
  products: v.number(),
  itemsAdded: v.number(),
  itemsBought: v.number(),
  /** Null when the period before is not held. */
  itemsAddedBefore: v.union(v.number(), v.null()),
  itemsBoughtBefore: v.union(v.number(), v.null()),
  /** Every item the website sold in the dates. */
  websiteItemsBought: v.number(),
});

const saleValidator = v.object({
  eventName: v.string(),
  /** Whether it is a shop's sale; elsewhere, the website's busiest counted conversion from this page. */
  shop: v.boolean(),
  /** Visits that started on the page and did it. */
  visits: v.number(),
  /** Visits that started on the page. */
  startedVisits: v.number(),
  /** Every visit to the website, and those that did it. */
  websiteVisits: v.number(),
  websiteEventVisits: v.number(),
});

/** A landing row's visits with an event: its own count of visits where kept, Google's count of times on an older row. */
const visitsWith = (row: ListRow, event: string) => row.eventVisits?.get(event) ?? row.counts.get(event) ?? 0;

const boxesArgs = { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };
const boxesValidator = v.union(v.null(), v.object({ product: v.union(v.null(), productValidator), sale: v.union(v.null(), saleValidator) }));
export type PageBoxes = typeof boxesValidator.type;

export const analyticsPageBoxes = tenantQuery({
  args: boxesArgs,
  returns: boxesValidator,
  handler: async (ctx, args) => await readPageBoxes(ctx, args),
});

/** The boxes' figures, for the screen and Ask Hakken alike: the caller's own website only. */
export async function readPageBoxes(ctx: SiteReader, args: ObjectType<typeof boxesArgs>): Promise<PageBoxes> {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay || !isPageRef(args.page)) return null;
    const shop = connection.shop === true;

    let product: typeof productValidator.type | null = null;
    if (shop) {
      const [address] = await decodePages(ctx, holdId, [args.page]);
      const products = await productsOf(ctx, holdId, args, country);
      const sold = products.rows.filter((row) => address && soldOnPage(row.name, address));
      if (sold.length > 0) {
        const before = await readFor(ctx, holdId, "product", args.period, "BEFORE", args.device, undefined, country);
        const held = before && before !== "LIVE" ? before : null;
        const soldKeys = new Set(sold.map((row) => row.key));
        const earlier = held ? held.rows.filter((row) => soldKeys.has(row.key)) : null;
        product = {
          products: sold.length,
          itemsAdded: sold.reduce((sum, row) => sum + row.basket, 0),
          itemsBought: sold.reduce((sum, row) => sum + row.bought, 0),
          itemsAddedBefore: earlier ? earlier.reduce((sum, row) => sum + (row.basket ?? 0), 0) : null,
          itemsBoughtBefore: earlier ? earlier.reduce((sum, row) => sum + row.purchases, 0) : null,
          websiteItemsBought: products.rows.reduce((sum, row) => sum + row.bought, 0),
        };
      }
    }

    const byChannel = await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device);
    if (!byChannel) return { product, sale: null };
    // The landing pages' own number for the page: Analytics names a landing page without its trailing slash, which can
    // be a second number (googleAnalyticsPageNumbers.ts, `landingKeyOf`).
    const landed = await landingKeyOf(ctx, holdId, args.page, byChannel.rows.map((row) => splitChannelKey(row.key).channel));
    const own = byChannel.rows.filter((row) => splitChannelKey(row.key).channel === landed);
    const startedVisits = own.reduce((sum, row) => sum + row.visits, 0);
    // A shop's sale as it picked it on Products, else Google's own; elsewhere the counted conversion most of this page's visits did.
    let eventName: string | null = null;
    if (shop) {
      const events = await readFor(ctx, holdId, "event", args.period, "NOW", args.device, undefined, country);
      const recorded = new Set((events && events !== "LIVE" ? events.rows : []).filter((row) => row.visits > 0 && !AUTOMATIC_EVENTS.has(row.key)).map((row) => row.key));
      eventName = shopChoiceOf(connection, recorded).sale;
    }
    if (eventName === null) {
      const counted = countedOf(connection).map((event) => event.eventName);
      eventName = counted
        .map((name) => ({ name, visits: own.reduce((sum, row) => sum + visitsWith(row, name), 0) }))
        .sort((left, right) => right.visits - left.visits || left.name.localeCompare(right.name))[0]?.name ?? null;
    }
    if (eventName === null) return { product, sale: null };
    const event = eventName;
    return {
      product,
      sale: {
        eventName: event,
        shop,
        visits: own.reduce((sum, row) => sum + visitsWith(row, event), 0),
        startedVisits,
        websiteVisits: byChannel.rows.reduce((sum, row) => sum + row.visits, 0),
        websiteEventVisits: byChannel.rows.reduce((sum, row) => sum + visitsWith(row, event), 0),
      },
    };
}
